import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { COURSE_MANAGEMENT_ROLES, LEARNER_ROLES } from '../auth/roles';
import { pool } from '../db/pool';
import { beginIdempotentRequest, completeIdempotentRequest, readIdempotencyKey } from '../lib/idempotency';
import type { PaymentWebhookPayload } from '../lib/payment-processing';
import { processPaymentEvent } from '../lib/payment-processing';

const orderSchema = z.object({
  items: z.array(z.object({
    type: z.enum(['course', 'subscription']),
    courseId: z.uuid().optional(),
    subscriptionPlanId: z.uuid().optional(),
  })).min(1),
  promocode: z.string().trim().min(1).optional(),
});

const confirmDemoPaymentParamsSchema = z.object({
  orderId: z.uuid(),
});

function buildOrderNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `ORD-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function registerCheckoutRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/checkout/orders', {
    preHandler: [
      app.requireAuth,
      app.requireRoles(LEARNER_ROLES),
      app.rateLimit({
        name: 'checkout:create-order',
        max: 20,
        windowMs: 10 * 60 * 1000,
        keyGenerator: (request) => request.auth?.userId ?? request.ip,
      }),
    ],
  }, async (request, reply) => {
    const payload = orderSchema.parse(request.body);
    const userId = request.auth!.userId;
    const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key']);
    if (!idempotencyKey) {
      return reply.badRequest('Idempotency-Key header is required');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const idempotency = await beginIdempotentRequest(client, {
        scope: 'checkout:create-order',
        idempotencyKey,
        userId,
        requestPayload: payload,
        ttlSeconds: 60 * 60 * 24,
      });

      if (idempotency.kind === 'replay') {
        await client.query('COMMIT');
        reply.header('Idempotency-Replayed', 'true');
        return reply.code(idempotency.statusCode).send(idempotency.body);
      }

      if (idempotency.kind === 'conflict') {
        throw app.httpErrors.conflict(idempotency.message);
      }

      const userResult = await client.query<{ email: string }>(
        `SELECT email::text AS email FROM users WHERE id = $1 AND status = 'active'`,
        [userId],
      );
      if (userResult.rowCount !== 1) {
        throw app.httpErrors.badRequest('User not found or inactive');
      }

      const normalizedItems = [] as Array<{
        type: 'course' | 'subscription';
        courseId: string | null;
        subscriptionPlanId: string | null;
        titleSnapshot: string;
        snapshot: Record<string, unknown>;
        unitPriceAmount: number;
      }>;

      for (const item of payload.items) {
        if (item.type === 'course') {
          if (!item.courseId) {
            throw app.httpErrors.badRequest('courseId is required for course items');
          }

          const course = await client.query(
            `
              SELECT id, title, slug, teacher_id, compare_at_amount, price_amount
              FROM courses
              WHERE id = $1 AND status = 'published' AND deleted_at IS NULL
            `,
            [item.courseId],
          );
          if (course.rowCount !== 1) {
            throw app.httpErrors.badRequest('Course not found');
          }

          normalizedItems.push({
            type: 'course',
            courseId: course.rows[0].id,
            subscriptionPlanId: null,
            titleSnapshot: course.rows[0].title,
            snapshot: {
              courseSlug: course.rows[0].slug,
              teacherId: course.rows[0].teacher_id,
              compareAtAmount: course.rows[0].compare_at_amount,
            },
            unitPriceAmount: Number(course.rows[0].price_amount),
          });
        } else {
          if (!item.subscriptionPlanId) {
            throw app.httpErrors.badRequest('subscriptionPlanId is required for subscription items');
          }

          const plan = await client.query(
            `
              SELECT id, code, name, billing_interval, interval_count, price_amount
              FROM subscription_plans
              WHERE id = $1 AND is_active = TRUE
            `,
            [item.subscriptionPlanId],
          );
          if (plan.rowCount !== 1) {
            throw app.httpErrors.badRequest('Subscription plan not found');
          }

          normalizedItems.push({
            type: 'subscription',
            courseId: null,
            subscriptionPlanId: plan.rows[0].id,
            titleSnapshot: plan.rows[0].name,
            snapshot: {
              planCode: plan.rows[0].code,
              billingInterval: plan.rows[0].billing_interval,
              intervalCount: plan.rows[0].interval_count,
            },
            unitPriceAmount: Number(plan.rows[0].price_amount),
          });
        }
      }

      const subtotalAmount = normalizedItems.reduce((sum, item) => sum + item.unitPriceAmount, 0);
      let discountAmount = 0;
      let promocodeId: string | null = null;

      if (payload.promocode) {
        const promo = await client.query(
          `
            SELECT id, discount_type::text AS discount_type, discount_value, max_discount_amount, min_order_amount
            FROM promocodes
            WHERE code = $1
              AND status = 'active'
              AND deleted_at IS NULL
              AND (starts_at IS NULL OR starts_at <= NOW())
              AND (ends_at IS NULL OR ends_at >= NOW())
          `,
          [payload.promocode],
        );

        if (promo.rowCount !== 1) {
          throw app.httpErrors.badRequest('Promocode is invalid');
        }

        const minOrderAmount = promo.rows[0].min_order_amount ? Number(promo.rows[0].min_order_amount) : 0;
        if (subtotalAmount < minOrderAmount) {
          throw app.httpErrors.badRequest('Promocode minimum order amount is not reached');
        }

        promocodeId = promo.rows[0].id;
        if (promo.rows[0].discount_type === 'percent') {
          discountAmount = subtotalAmount * Number(promo.rows[0].discount_value) / 100;
        } else {
          discountAmount = Number(promo.rows[0].discount_value);
        }

        if (promo.rows[0].max_discount_amount) {
          discountAmount = Math.min(discountAmount, Number(promo.rows[0].max_discount_amount));
        }
      }

      const totalAmount = Math.max(0, subtotalAmount - discountAmount);
      const orderNumber = buildOrderNumber();
      const orderInsert = await client.query<{ id: string }>(
        `
          INSERT INTO orders (
            user_id,
            order_number,
            status,
            currency,
            subtotal_amount,
            discount_amount,
            tax_amount,
            total_amount,
            promocode_id,
            billing_email,
            placed_at,
            expires_at
          ) VALUES ($1, $2, 'awaiting_payment', 'USD', $3, $4, 0, $5, $6, $7, NOW(), NOW() + INTERVAL '30 minutes')
          RETURNING id
        `,
        [userId, orderNumber, subtotalAmount, discountAmount, totalAmount, promocodeId, userResult.rows[0].email],
      );

      for (const item of normalizedItems) {
        const proportionalDiscount = subtotalAmount === 0 ? 0 : (item.unitPriceAmount / subtotalAmount) * discountAmount;
        const finalPriceAmount = Math.max(0, item.unitPriceAmount - proportionalDiscount);

        await client.query(
          `
            INSERT INTO order_items (
              order_id,
              item_type,
              course_id,
              subscription_plan_id,
              title_snapshot,
              item_snapshot,
              quantity,
              unit_price_amount,
              discount_amount,
              final_price_amount,
              currency
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1, $7, $8, $9, 'USD')
          `,
          [
            orderInsert.rows[0].id,
            item.type,
            item.courseId,
            item.subscriptionPlanId,
            item.titleSnapshot,
            JSON.stringify(item.snapshot),
            item.unitPriceAmount,
            Number(proportionalDiscount.toFixed(2)),
            Number(finalPriceAmount.toFixed(2)),
          ],
        );
      }

      const responseBody = {
        orderId: orderInsert.rows[0].id,
        orderNumber,
        status: 'awaiting_payment',
        totalAmount: Number(totalAmount.toFixed(2)),
        currency: 'USD',
      };

      await completeIdempotentRequest(client, {
        scope: 'checkout:create-order',
        idempotencyKey,
        statusCode: 201,
        body: responseBody,
        resourceType: 'order',
        resourceId: orderInsert.rows[0].id,
      });

      await client.query('COMMIT');
      return reply.code(201).send(responseBody);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/checkout/orders/:orderId/confirm-demo-payment', {
    preHandler: [app.requireAuth, app.requireRoles(LEARNER_ROLES)],
  }, async (request, reply) => {
    if (!process.env.ENABLE_DEMO_PAYMENTS || process.env.ENABLE_DEMO_PAYMENTS === 'false') {
      return reply.forbidden('Demo payments are disabled');
    }

    const params = confirmDemoPaymentParamsSchema.parse(request.params);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const orderResult = await client.query<{
        order_number: string;
        total_amount: string;
        currency: string;
      }>(
        `
          SELECT order_number, total_amount::text AS total_amount, currency
          FROM orders
          WHERE id = $1
            AND user_id = $2
          FOR UPDATE
        `,
        [params.orderId, request.auth!.userId],
      );

      if (orderResult.rowCount !== 1) {
        throw app.httpErrors.notFound('Order not found');
      }

      const order = orderResult.rows[0];
      const payload: PaymentWebhookPayload = {
        orderNumber: order.order_number,
        provider: 'manual',
        providerPaymentId: `manual_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        status: 'succeeded',
        amount: Number(order.total_amount),
        currency: order.currency,
      };

      await processPaymentEvent(client, payload, `demo:${payload.providerPaymentId}`);
      await client.query('COMMIT');

      return reply.send({
        orderNumber: order.order_number,
        paid: true,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
