import { Client } from 'pg';

import { env } from '../../src/config/env';

type QueryResultSummary = {
  scenario: string;
  ok: boolean;
  details: Record<string, unknown>;
};

async function main(): Promise<void> {
  const client = new Client({
    connectionString: env.DATABASE_URL,
  });

  await client.connect();

  const summaries: QueryResultSummary[] = [];

  try {
    const purchase = await client.query(`
      SELECT o.order_number, o.status, p.status AS payment_status, oi.final_price_amount
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.order_number = 'ORD-20260316-0001'
    `);
    summaries.push({
      scenario: 'course_purchase',
      ok: purchase.rowCount === 1,
      details: purchase.rows[0] ?? {},
    });

    const enrollment = await client.query(`
      SELECT e.access_type, e.status, c.slug
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN users u ON u.id = e.user_id
      WHERE u.email = 'student@neqcourse.com'
        AND c.slug = 'postgresql-for-backend-developers'
    `);
    summaries.push({
      scenario: 'purchase_enrollment',
      ok: enrollment.rowCount === 1,
      details: enrollment.rows[0] ?? {},
    });

    const subscriptionAccess = await client.query(`
      SELECT s.status AS subscription_status, e.access_type, e.access_ends_at
      FROM subscriptions s
      JOIN enrollments e ON e.subscription_id = s.id
      JOIN users u ON u.id = s.user_id
      WHERE u.email = 'subscriber@neqcourse.com'
    `);
    summaries.push({
      scenario: 'subscription_access',
      ok: subscriptionAccess.rowCount === 1,
      details: subscriptionAccess.rows[0] ?? {},
    });

    await client.query('BEGIN');
    const progressUpdate = await client.query(`
      UPDATE progress
      SET
        status = 'completed',
        is_completed = TRUE,
        progress_percent = 100,
        watch_percent = 100,
        completed_at = NOW(),
        last_viewed_at = NOW()
      WHERE lesson_id = (
        SELECT l.id
        FROM lessons l
        WHERE l.slug = 'er-design-for-course-platform'
        LIMIT 1
      )
      RETURNING status, is_completed, progress_percent, watch_percent
    `);
    await client.query('ROLLBACK');
    summaries.push({
      scenario: 'progress_update',
      ok: progressUpdate.rowCount === 1,
      details: progressUpdate.rows[0] ?? {},
    });

    const certificate = await client.query(`
      SELECT certificate_number, verification_code, status
      FROM certificates
      WHERE certificate_number = 'CERT-20260316-0001'
    `);
    summaries.push({
      scenario: 'certificate_issue',
      ok: certificate.rowCount === 1,
      details: certificate.rows[0] ?? {},
    });

    const promocode = await client.query(`
      SELECT p.code, p.discount_type, p.discount_value, o.discount_amount
      FROM promocodes p
      JOIN orders o ON o.promocode_id = p.id
      WHERE p.code = 'SPRING20'
        AND o.order_number = 'ORD-20260316-0001'
    `);
    summaries.push({
      scenario: 'promocode_application',
      ok: promocode.rowCount === 1,
      details: promocode.rows[0] ?? {},
    });

    for (const summary of summaries) {
      console.log(JSON.stringify(summary));
    }
  } finally {
    await client.end();
  }
}

void main();
