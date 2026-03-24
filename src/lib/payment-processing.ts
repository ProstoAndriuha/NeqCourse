import type { PoolClient } from 'pg';

type BillingInterval = 'month' | 'quarter' | 'year';
type SubscriptionScope = 'all_courses' | 'selected_courses';

export type PaymentWebhookPayload = {
  orderNumber: string;
  provider: 'stripe' | 'paypal' | 'bank_transfer' | 'manual';
  providerPaymentId: string;
  providerCustomerId?: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'canceled';
  amount: number;
  currency: string;
  paymentMethodLast4?: string;
};

function addBillingInterval(start: Date, interval: BillingInterval, intervalCount: number): Date {
  const next = new Date(start);

  if (interval === 'month') {
    next.setUTCMonth(next.getUTCMonth() + intervalCount);
    return next;
  }

  if (interval === 'quarter') {
    next.setUTCMonth(next.getUTCMonth() + intervalCount * 3);
    return next;
  }

  next.setUTCFullYear(next.getUTCFullYear() + intervalCount);
  return next;
}

async function getSubscriptionCourseIds(client: PoolClient, planId: string): Promise<string[]> {
  const planResult = await client.query<{
    scope: SubscriptionScope;
  }>(
    `SELECT scope::text AS scope FROM subscription_plans WHERE id = $1 AND is_active = TRUE`,
    [planId],
  );

  if (planResult.rowCount !== 1) {
    return [];
  }

  if (planResult.rows[0].scope === 'selected_courses') {
    const selectedCourses = await client.query<{ course_id: string }>(
      `
        SELECT spc.course_id
        FROM subscription_plan_courses spc
        JOIN courses c ON c.id = spc.course_id
        WHERE spc.plan_id = $1
          AND c.status = 'published'
          AND c.deleted_at IS NULL
      `,
      [planId],
    );

    return selectedCourses.rows.map((row) => row.course_id);
  }

  const includedCourses = await client.query<{ id: string }>(
    `
      SELECT id
      FROM courses
      WHERE status = 'published'
        AND deleted_at IS NULL
        AND is_subscription_included = TRUE
    `,
  );

  return includedCourses.rows.map((row) => row.id);
}

export async function processPaymentEvent(client: PoolClient, payload: PaymentWebhookPayload, idempotencyKey: string): Promise<{ orderId: string }> {
  const orderResult = await client.query<{
    id: string;
    user_id: string;
  }>(
    `SELECT id, user_id FROM orders WHERE order_number = $1 FOR UPDATE`,
    [payload.orderNumber],
  );

  if (orderResult.rowCount !== 1) {
    throw new Error('Order not found');
  }

  const order = orderResult.rows[0];
  await client.query(
    `
      INSERT INTO payments (
        order_id,
        user_id,
        provider,
        status,
        amount,
        currency,
        provider_payment_id,
        provider_customer_id,
        idempotency_key,
        payment_method_last4,
        paid_at,
        metadata,
        raw_payload
      ) VALUES (
        $1,
        $2,
        $3,
        $4::payment_status_enum,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        CASE WHEN $4::payment_status_enum = 'succeeded'::payment_status_enum THEN NOW() ELSE NULL END,
        '{}'::jsonb,
        $11::jsonb
      )
      ON CONFLICT (provider, provider_payment_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        paid_at = EXCLUDED.paid_at,
        provider_customer_id = EXCLUDED.provider_customer_id,
        payment_method_last4 = EXCLUDED.payment_method_last4,
        raw_payload = EXCLUDED.raw_payload
    `,
    [
      order.id,
      order.user_id,
      payload.provider,
      payload.status,
      payload.amount,
      payload.currency,
      payload.providerPaymentId,
      payload.providerCustomerId ?? null,
      idempotencyKey,
      payload.paymentMethodLast4 ?? null,
      JSON.stringify(payload),
    ],
  );

  if (payload.status === 'succeeded') {
    await client.query(
      `UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1`,
      [order.id],
    );

    const items = await client.query<{
      id: string;
      item_type: 'course' | 'subscription';
      course_id: string | null;
      subscription_plan_id: string | null;
    }>(
      `SELECT id, item_type, course_id, subscription_plan_id FROM order_items WHERE order_id = $1`,
      [order.id],
    );

    for (const item of items.rows) {
      if (item.item_type === 'course' && item.course_id) {
        await client.query(
          `
            INSERT INTO enrollments (user_id, course_id, order_item_id, status, access_type, granted_at, access_starts_at)
            VALUES ($1, $2, $3, 'active', 'purchase', NOW(), NOW())
            ON CONFLICT (user_id, course_id)
            DO UPDATE SET status = 'active', order_item_id = EXCLUDED.order_item_id, access_type = 'purchase'
          `,
          [order.user_id, item.course_id, item.id],
        );
        continue;
      }

      if (item.item_type === 'subscription' && item.subscription_plan_id) {
        const planResult = await client.query<{
          billing_interval: BillingInterval;
          interval_count: number;
        }>(
          `
            SELECT billing_interval::text AS billing_interval, interval_count
            FROM subscription_plans
            WHERE id = $1
          `,
          [item.subscription_plan_id],
        );

        if (planResult.rowCount !== 1) {
          throw new Error('Subscription plan not found for payment item');
        }

        const periodStart = new Date();
        const periodEnd = addBillingInterval(periodStart, planResult.rows[0].billing_interval, planResult.rows[0].interval_count);
        const providerSubscriptionId = `sub_${payload.providerPaymentId}`;
        const subscription = await client.query<{ id: string }>(
          `
            INSERT INTO subscriptions (
              user_id,
              plan_id,
              order_id,
              status,
              auto_renew,
              started_at,
              current_period_start,
              current_period_end,
              provider_customer_id,
              provider_subscription_id
            ) VALUES ($1, $2, $3, 'active', TRUE, $4, $4, $5, $6, $7)
            ON CONFLICT (provider_subscription_id)
            DO UPDATE SET
              order_id = EXCLUDED.order_id,
              status = EXCLUDED.status,
              auto_renew = EXCLUDED.auto_renew,
              current_period_start = EXCLUDED.current_period_start,
              current_period_end = EXCLUDED.current_period_end,
              provider_customer_id = EXCLUDED.provider_customer_id
            RETURNING id
          `,
          [
            order.user_id,
            item.subscription_plan_id,
            order.id,
            periodStart,
            periodEnd,
            payload.providerCustomerId ?? null,
            providerSubscriptionId,
          ],
        );

        const courseIds = await getSubscriptionCourseIds(client, item.subscription_plan_id);
        for (const courseId of courseIds) {
          await client.query(
            `
              INSERT INTO enrollments (
                user_id,
                course_id,
                subscription_id,
                status,
                access_type,
                granted_at,
                access_starts_at,
                access_ends_at
              ) VALUES ($1, $2, $3, 'active', 'subscription', NOW(), $4, $5)
              ON CONFLICT (user_id, course_id)
              DO UPDATE SET
                subscription_id = EXCLUDED.subscription_id,
                status = 'active',
                access_type = 'subscription',
                access_starts_at = EXCLUDED.access_starts_at,
                access_ends_at = EXCLUDED.access_ends_at
            `,
            [order.user_id, courseId, subscription.rows[0].id, periodStart, periodEnd],
          );
        }
      }
    }
  }

  return {
    orderId: order.id,
  };
}
