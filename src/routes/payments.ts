import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/pool';
import { beginIdempotentRequest, completeIdempotentRequest, readIdempotencyKey } from '../lib/idempotency';
import type { PaymentWebhookPayload } from '../lib/payment-processing';
import { processPaymentEvent } from '../lib/payment-processing';
import { verifyWebhookSignature } from '../lib/webhook-signature';

const webhookSchema = z.object({
  orderNumber: z.string().min(1),
  provider: z.enum(['stripe', 'paypal', 'bank_transfer', 'manual']),
  providerPaymentId: z.string().min(1),
  providerCustomerId: z.string().optional(),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'canceled']),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  paymentMethodLast4: z.string().length(4).optional(),
});

export async function registerPaymentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/payments/webhook', {
    preHandler: app.rateLimit({
      name: 'payments:webhook',
      max: 60,
      windowMs: 10 * 60 * 1000,
      keyGenerator: (request) => {
        const body = typeof request.body === 'object' && request.body ? request.body as { provider?: string; providerPaymentId?: string } : {};
        return `${request.ip}:${body.provider ?? 'provider'}:${body.providerPaymentId ?? 'unknown'}`;
      },
    }),
  }, async (request, reply) => {
    const payload = webhookSchema.parse(request.body) as PaymentWebhookPayload;
    const timestamp = typeof request.headers['x-webhook-timestamp'] === 'string' ? request.headers['x-webhook-timestamp'] : null;
    const signature = typeof request.headers['x-webhook-signature'] === 'string' ? request.headers['x-webhook-signature'] : null;

    if (!timestamp || !signature || !verifyWebhookSignature(payload, timestamp, signature)) {
      return reply.unauthorized('Invalid webhook signature');
    }

    const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key']) ?? `${payload.provider}:${payload.providerPaymentId}`;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const idempotency = await beginIdempotentRequest(client, {
        scope: 'payments:webhook',
        idempotencyKey,
        requestPayload: payload,
        ttlSeconds: 60 * 60 * 24 * 7,
      });

      if (idempotency.kind === 'replay') {
        await client.query('COMMIT');
        reply.header('Idempotency-Replayed', 'true');
        return reply.code(idempotency.statusCode).send(idempotency.body);
      }

      if (idempotency.kind === 'conflict') {
        throw app.httpErrors.conflict(idempotency.message);
      }

      const { orderId } = await processPaymentEvent(client, payload, idempotencyKey);

      const responseBody = {
        received: true,
      };

      await completeIdempotentRequest(client, {
        scope: 'payments:webhook',
        idempotencyKey,
        statusCode: 200,
        body: responseBody,
        resourceType: 'order',
        resourceId: orderId,
      });

      await client.query('COMMIT');
      return reply.send(responseBody);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
