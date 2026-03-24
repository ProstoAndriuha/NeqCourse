import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { Client } from 'pg';

import { signWebhookPayload } from '../../src/lib/webhook-signature';

const rootDir = process.cwd();
const migrationsDir = path.resolve(rootDir, 'backend', 'migrations');
const seedPath = path.resolve(rootDir, 'backend', 'seed.sql');
const dataDir = path.resolve(rootDir, '.local', 'embedded-postgres');
const port = 55432;
const user = 'postgres';
const password = 'postgres';
const database = 'neqcourse';
const connectionString = `postgres://${user}:${password}@127.0.0.1:${port}/${database}`;

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '');
}

function signedWebhookHeaders(payload: unknown): Record<string, string> {
  const timestamp = String(Date.now());
  return {
    'x-webhook-timestamp': timestamp,
    'x-webhook-signature': signWebhookPayload(payload, timestamp),
  };
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS backend_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyMigrations(client: Client): Promise<void> {
  await ensureMigrationsTable(client);

  const filenames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const filename of filenames) {
    const sql = stripBom(await readFile(path.join(migrationsDir, filename), 'utf8'));
    const hash = checksum(sql);
    const existing = await client.query<{ checksum: string }>(
      `SELECT checksum FROM backend_migrations WHERE filename = $1`,
      [filename],
    );

    if (existing.rowCount === 1) {
      if (existing.rows[0].checksum !== hash) {
        throw new Error(`Migration checksum mismatch for ${filename}`);
      }

      continue;
    }

    await client.query(sql);
    await client.query(
      `INSERT INTO backend_migrations (filename, checksum) VALUES ($1, $2)`,
      [filename, hash],
    );
  }
}

async function runSqlScenarioChecks(client: Client): Promise<void> {
  const checks = [
    {
      name: 'registration_seeded_user',
      sql: `SELECT email, role, status FROM users WHERE email = 'student@neqcourse.com'`,
    },
    {
      name: 'order_and_order_item',
      sql: `
        SELECT o.order_number, o.status, oi.title_snapshot, oi.final_price_amount
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.order_number = 'ORD-20260316-0001'
      `,
    },
    {
      name: 'payment_and_enrollment',
      sql: `
        SELECT p.status AS payment_status, e.access_type, e.status AS enrollment_status
        FROM payments p
        JOIN orders o ON o.id = p.order_id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN enrollments e ON e.order_item_id = oi.id
        WHERE o.order_number = 'ORD-20260316-0001'
      `,
    },
    {
      name: 'subscription_access',
      sql: `
        SELECT s.status AS subscription_status, e.access_type, e.access_ends_at
        FROM subscriptions s
        JOIN enrollments e ON e.subscription_id = s.id
        JOIN users u ON u.id = s.user_id
        WHERE u.email = 'subscriber@neqcourse.com'
      `,
    },
    {
      name: 'certificate_exists',
      sql: `SELECT certificate_number, verification_code, status FROM certificates WHERE certificate_number = 'CERT-20260316-0001'`,
    },
    {
      name: 'promocode_applied',
      sql: `
        SELECT p.code, p.discount_value, o.discount_amount
        FROM promocodes p
        JOIN orders o ON o.promocode_id = p.id
        WHERE p.code = 'SPRING20'
          AND o.order_number = 'ORD-20260316-0001'
      `,
    },
  ];

  for (const check of checks) {
    const result = await client.query(check.sql);
    if (result.rowCount !== 1) {
      throw new Error(`Scenario failed: ${check.name}`);
    }

    console.log(JSON.stringify({ scenario: check.name, ok: true, details: result.rows[0] }));
  }

  await client.query('BEGIN');
  const progress = await client.query(`
    UPDATE progress
    SET status = 'completed', is_completed = TRUE, progress_percent = 100, watch_percent = 100, completed_at = NOW(), last_viewed_at = NOW()
    WHERE lesson_id = (
      SELECT id FROM lessons WHERE slug = 'er-design-for-course-platform' LIMIT 1
    )
    RETURNING status, is_completed, progress_percent, watch_percent
  `);
  await client.query('ROLLBACK');

  if (progress.rowCount !== 1) {
    throw new Error('Scenario failed: progress_update');
  }

  console.log(JSON.stringify({ scenario: 'progress_update', ok: true, details: progress.rows[0] }));
}

async function runApiScenarioChecks(client: Client): Promise<void> {
  process.env.DATABASE_URL = connectionString;
  process.env.APP_SECRET ??= 'dev-secret-change-me-123';
  process.env.ACCESS_TOKEN_TTL_SECONDS ??= '900';
  process.env.REFRESH_TOKEN_TTL_SECONDS ??= '2592000';
  process.env.PAYMENTS_WEBHOOK_SECRET ??= 'dev-webhook-secret-change-me-123';
  process.env.ENABLE_DEMO_PAYMENTS ??= 'true';

  const [{ buildApp }, { pool: apiPool }] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/db/pool.js'),
  ]);

  const app = buildApp();

  try {
    const course = await client.query<{ id: string }>(`SELECT id FROM courses WHERE slug = 'postgresql-for-backend-developers' LIMIT 1`);
    const lesson = await client.query<{ id: string }>(`SELECT id FROM lessons WHERE slug = 'er-design-for-course-platform' LIMIT 1`);

    const email = `api-user-${randomUUID().slice(0, 8)}@example.com`;
    const passwordValue = 'StrongPass123!';

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email,
        password: passwordValue,
        firstName: 'Api',
        lastName: 'User',
      },
    });
    if (registerResponse.statusCode !== 201) {
      throw new Error(`API scenario failed: auth_register ${registerResponse.statusCode} ${registerResponse.body}`);
    }
    console.log(JSON.stringify({ scenario: 'api_auth_register', ok: true, details: registerResponse.json() }));

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email,
        password: passwordValue,
      },
    });
    if (loginResponse.statusCode !== 200) {
      throw new Error(`API scenario failed: auth_login ${loginResponse.statusCode} ${loginResponse.body}`);
    }
    const login = loginResponse.json() as { accessToken: string; refreshToken: string };
    console.log(JSON.stringify({ scenario: 'api_auth_login', ok: true, details: { hasAccessToken: Boolean(login.accessToken), hasRefreshToken: Boolean(login.refreshToken) } }));

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: {
        refreshToken: login.refreshToken,
      },
    });
    if (refreshResponse.statusCode !== 200) {
      throw new Error(`API scenario failed: auth_refresh ${refreshResponse.statusCode} ${refreshResponse.body}`);
    }
    const refreshed = refreshResponse.json() as { accessToken: string; refreshToken: string };
    const authHeaders = {
      authorization: `Bearer ${refreshed.accessToken}`,
    };
    console.log(JSON.stringify({ scenario: 'api_auth_refresh', ok: true, details: { rotated: refreshed.refreshToken !== login.refreshToken } }));

    const catalogResponse = await app.inject({
      method: 'GET',
      url: '/api/catalog/courses',
    });
    if (catalogResponse.statusCode !== 200) {
      throw new Error(`API scenario failed: catalog_list ${catalogResponse.statusCode} ${catalogResponse.body}`);
    }
    const catalog = catalogResponse.json() as { items: Array<{ id: string }> };
    if (catalog.items.length === 0) {
      throw new Error('API scenario failed: catalog_list empty');
    }
    console.log(JSON.stringify({ scenario: 'api_catalog_list', ok: true, details: { count: catalog.items.length } }));

    const orderResponse = await app.inject({
      method: 'POST',
      url: '/api/checkout/orders',
      headers: {
        ...authHeaders,
        'idempotency-key': `checkout-${randomUUID()}`,
      },
      payload: {
        items: [{ type: 'course', courseId: course.rows[0].id }],
        promocode: 'SPRING20',
      },
    });
    if (orderResponse.statusCode !== 201) {
      throw new Error(`API scenario failed: checkout_order ${orderResponse.statusCode} ${orderResponse.body}`);
    }
    const order = orderResponse.json() as { orderId: string; orderNumber: string };
    console.log(JSON.stringify({ scenario: 'api_checkout_order', ok: true, details: order }));

    const webhookPayload = {
      orderNumber: order.orderNumber,
      provider: 'stripe',
      providerPaymentId: `pi_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      providerCustomerId: `cus_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      status: 'succeeded',
      amount: 119.2,
      currency: 'USD',
      paymentMethodLast4: '4242',
    };
    const webhookResponse = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      headers: signedWebhookHeaders(webhookPayload),
      payload: webhookPayload,
    });
    if (webhookResponse.statusCode !== 200) {
      throw new Error(`API scenario failed: payments_webhook ${webhookResponse.statusCode} ${webhookResponse.body}`);
    }
    console.log(JSON.stringify({ scenario: 'api_payments_webhook', ok: true, details: webhookResponse.json() }));

    const accessResponse = await app.inject({
      method: 'GET',
      url: `/api/enrollments/${course.rows[0].id}/access`,
      headers: authHeaders,
    });
    if (accessResponse.statusCode !== 200) {
      throw new Error(`API scenario failed: enrollments_access ${accessResponse.statusCode} ${accessResponse.body}`);
    }
    const access = accessResponse.json() as { hasAccess: boolean };
    if (!access.hasAccess) {
      throw new Error('API scenario failed: enrollments_access denied');
    }
    console.log(JSON.stringify({ scenario: 'api_enrollment_access', ok: true, details: access }));

    const progressResponse = await app.inject({
      method: 'PUT',
      url: `/api/progress/lessons/${lesson.rows[0].id}`,
      headers: authHeaders,
      payload: {
        status: 'in_progress',
        progressPercent: 55,
        watchPercent: 55,
        lastPositionSeconds: 990,
        isCompleted: false,
      },
    });
    if (progressResponse.statusCode !== 200) {
      throw new Error(`API scenario failed: progress_update ${progressResponse.statusCode} ${progressResponse.body}`);
    }
    console.log(JSON.stringify({ scenario: 'api_progress_update', ok: true, details: progressResponse.json() }));

    const reviewResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: authHeaders,
      payload: {
        courseId: course.rows[0].id,
        rating: 5,
        title: 'API review',
        body: 'Reviewed through authenticated API.',
      },
    });
    if (reviewResponse.statusCode !== 201) {
      throw new Error(`API scenario failed: review_create ${reviewResponse.statusCode} ${reviewResponse.body}`);
    }
    console.log(JSON.stringify({ scenario: 'api_review_create', ok: true, details: reviewResponse.json() }));
  } finally {
    await app.close();
    await apiPool.end();
  }
}

async function main(): Promise<void> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  await mkdir(path.dirname(dataDir), { recursive: true });
  await rm(dataDir, { recursive: true, force: true });

  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    persistent: true,
    initdbFlags: ['--encoding=UTF8'],
    onLog: (message: string) => console.log(`[embedded-postgres] ${message}`),
    onError: (message: unknown) => console.error(`[embedded-postgres] ${String(message)}`),
  });

  await postgres.initialise();
  await postgres.start();

  try {
    await postgres.createDatabase(database);

    const client = new Client({ connectionString });
    await client.connect();

    try {
      await applyMigrations(client);
      const seedSql = stripBom(await readFile(seedPath, 'utf8'));
      await client.query(seedSql);
      await runSqlScenarioChecks(client);
      await runApiScenarioChecks(client);
    } finally {
      await client.end();
    }
  } finally {
    await postgres.stop();
  }
}

void main();
