import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { Client } from 'pg';

import { signWebhookPayload } from '../../src/lib/webhook-signature.js';

const rootDir = process.cwd();
const migrationsDir = path.resolve(rootDir, 'backend', 'migrations');
const seedPath = path.resolve(rootDir, 'backend', 'seed.sql');
const dataDir = path.resolve(rootDir, '.local', 'embedded-postgres-tests');
const port = 55433;
const user = 'postgres';
const password = 'postgres';
const database = 'neqcourse_tests';
const connectionString = `postgres://${user}:${password}@127.0.0.1:${port}/${database}`;

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
    const checksum = Buffer.from(sql, 'utf8').toString('base64');
    const existing = await client.query<{ checksum: string }>(
      `SELECT checksum FROM backend_migrations WHERE filename = $1`,
      [filename],
    );

    if (existing.rowCount === 1) {
      assert.equal(existing.rows[0].checksum, checksum);
      continue;
    }

    await client.query(sql);
    await client.query(
      `INSERT INTO backend_migrations (filename, checksum) VALUES ($1, $2)`,
      [filename, checksum],
    );
  }
}

test('route integration suite', async (t) => {
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
  });

  let app: FastifyInstance | null = null;
  let apiPool: Pool | null = null;
  let client: Client | null = null;
  let courseId = '';
  let lessonId = '';
  let checkoutUser: { email: string; password: string; accessToken: string; refreshToken: string; userId: string } | null = null;
  let checkoutOrder: { orderId: string; orderNumber: string } | null = null;

  await postgres.initialise();
  await postgres.start();

  try {
    await postgres.createDatabase(database);
    client = new Client({ connectionString });
    await client.connect();
    await applyMigrations(client);
    await client.query(stripBom(await readFile(seedPath, 'utf8')));

    process.env.DATABASE_URL = connectionString;
    process.env.APP_SECRET = 'dev-secret-change-me-123';
    process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
    process.env.REFRESH_TOKEN_TTL_SECONDS = '2592000';
    process.env.PAYMENTS_WEBHOOK_SECRET = 'dev-webhook-secret-change-me-123';
    process.env.ENABLE_DEMO_PAYMENTS = 'true';

    const [{ buildApp }, poolModule] = await Promise.all([
      import('../../src/app.js'),
      import('../../src/db/pool.js'),
    ]);

    apiPool = poolModule.pool;
    app = buildApp();

    const course = await apiPool.query<{ id: string }>(`SELECT id FROM courses WHERE slug = 'postgresql-for-backend-developers' LIMIT 1`);
    const lesson = await apiPool.query<{ id: string }>(`SELECT id FROM lessons WHERE slug = 'er-design-for-course-platform' LIMIT 1`);
    courseId = course.rows[0].id;
    lessonId = lesson.rows[0].id;

    await t.test('auth refresh rotation and revoke lifecycle', async () => {
      assert.ok(app);

      const email = `auth-${randomUUID().slice(0, 8)}@example.com`;
      const passwordValue = 'StrongPass123!';

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email,
          password: passwordValue,
          firstName: 'Auth',
          lastName: 'User',
        },
      });
      assert.equal(registerResponse.statusCode, 201);

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: passwordValue },
      });
      assert.equal(loginResponse.statusCode, 200);
      const login = loginResponse.json() as { accessToken: string; refreshToken: string };

      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: login.refreshToken },
      });
      assert.equal(refreshResponse.statusCode, 200);
      const refreshed = refreshResponse.json() as { accessToken: string; refreshToken: string };
      assert.notEqual(refreshed.refreshToken, login.refreshToken);

      const reusedRefreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: login.refreshToken },
      });
      assert.equal(reusedRefreshResponse.statusCode, 401);

      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${refreshed.accessToken}` },
        payload: { refreshToken: refreshed.refreshToken },
      });
      assert.equal(logoutResponse.statusCode, 200);

      const revokedRefreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: refreshed.refreshToken },
      });
      assert.equal(revokedRefreshResponse.statusCode, 401);
    });

    await t.test('teacher ownership checks and course management crud', async () => {
      assert.ok(app);

      const teacherLoginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'teacher@neqcourse.com',
          password: 'Teacher@2026',
        },
      });
      assert.equal(teacherLoginResponse.statusCode, 200);
      const teacherLogin = teacherLoginResponse.json() as { accessToken: string };

      const teacherCoursesResponse = await app.inject({
        method: 'GET',
        url: '/api/teacher/courses',
        headers: { authorization: `Bearer ${teacherLogin.accessToken}` },
      });
      assert.equal(teacherCoursesResponse.statusCode, 200);

      const createCourseResponse = await app.inject({
        method: 'POST',
        url: '/api/teacher/courses',
        headers: { authorization: `Bearer ${teacherLogin.accessToken}` },
        payload: {
          title: 'API Owned Course',
          slug: `api-owned-course-${randomUUID().slice(0, 6)}`,
          shortDescription: 'Teacher-owned integration test course.',
          description: 'Teacher creates and updates this course.',
          status: 'draft',
          visibility: 'public',
          level: 'beginner',
          language: 'en',
          priceAmount: 49,
          currency: 'USD',
          durationMinutes: 60,
        },
      });
      assert.equal(createCourseResponse.statusCode, 201);
      const createdCourse = createCourseResponse.json() as { id: string };

      const createModuleResponse = await app.inject({
        method: 'POST',
        url: `/api/teacher/courses/${createdCourse.id}/modules`,
        headers: { authorization: `Bearer ${teacherLogin.accessToken}` },
        payload: {
          title: 'Module A',
          sortOrder: 1,
          isPublished: true,
        },
      });
      assert.equal(createModuleResponse.statusCode, 201);
      const createdModule = createModuleResponse.json() as { id: string };

      const createLessonResponse = await app.inject({
        method: 'POST',
        url: `/api/teacher/modules/${createdModule.id}/lessons`,
        headers: { authorization: `Bearer ${teacherLogin.accessToken}` },
        payload: {
          title: 'Lesson A',
          slug: `lesson-a-${randomUUID().slice(0, 6)}`,
          lessonType: 'video',
          status: 'published',
          sortOrder: 1,
          durationSeconds: 300,
          isPreview: false,
          isMandatory: true,
        },
      });
      assert.equal(createLessonResponse.statusCode, 201);

      const studentLoginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'student@neqcourse.com',
          password: 'Student@2026',
        },
      });
      assert.equal(studentLoginResponse.statusCode, 200);
      const studentLogin = studentLoginResponse.json() as { accessToken: string };

      const forbiddenUpdateResponse = await app.inject({
        method: 'PUT',
        url: `/api/teacher/courses/${createdCourse.id}`,
        headers: { authorization: `Bearer ${studentLogin.accessToken}` },
        payload: {
          title: 'Hijacked course title',
        },
      });
      assert.equal(forbiddenUpdateResponse.statusCode, 403);
    });

    await t.test('checkout idempotency returns same order and blocks payload drift', async () => {
      assert.ok(app);

      const email = `checkout-${randomUUID().slice(0, 8)}@example.com`;
      const passwordValue = 'StrongPass123!';

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email,
          password: passwordValue,
          firstName: 'Checkout',
          lastName: 'User',
        },
      });
      assert.equal(registerResponse.statusCode, 201);
      const registered = registerResponse.json() as { user: { id: string } };

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: passwordValue },
      });
      assert.equal(loginResponse.statusCode, 200);
      const login = loginResponse.json() as { accessToken: string; refreshToken: string };

      checkoutUser = {
        email,
        password: passwordValue,
        accessToken: login.accessToken,
        refreshToken: login.refreshToken,
        userId: registered.user.id,
      };

      const idempotencyKey = `checkout-${randomUUID()}`;
      const orderPayload = {
        items: [{ type: 'course', courseId }],
        promocode: 'SPRING20',
      };

      const firstOrderResponse = await app.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers: {
          authorization: `Bearer ${login.accessToken}`,
          'idempotency-key': idempotencyKey,
        },
        payload: orderPayload,
      });
      assert.equal(firstOrderResponse.statusCode, 201);
      checkoutOrder = firstOrderResponse.json() as { orderId: string; orderNumber: string };

      const replayedOrderResponse = await app.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers: {
          authorization: `Bearer ${login.accessToken}`,
          'idempotency-key': idempotencyKey,
        },
        payload: orderPayload,
      });
      assert.equal(replayedOrderResponse.statusCode, 201);
      assert.equal(replayedOrderResponse.headers['idempotency-replayed'], 'true');

      const driftResponse = await app.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers: {
          authorization: `Bearer ${login.accessToken}`,
          'idempotency-key': idempotencyKey,
        },
        payload: { items: [{ type: 'course', courseId }] },
      });
      assert.equal(driftResponse.statusCode, 409);
    });

    await t.test('payment webhook idempotency drives access, progress, and reviews', async () => {
      assert.ok(app);
      assert.ok(apiPool);
      assert.ok(checkoutUser);
      assert.ok(checkoutOrder);

      const providerPaymentId = `pi_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const webhookPayload = {
        orderNumber: checkoutOrder.orderNumber,
        provider: 'stripe',
        providerPaymentId,
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
      assert.equal(webhookResponse.statusCode, 200);

      const replayedWebhookResponse = await app.inject({
        method: 'POST',
        url: '/api/payments/webhook',
        headers: signedWebhookHeaders(webhookPayload),
        payload: webhookPayload,
      });
      assert.equal(replayedWebhookResponse.statusCode, 200);
      assert.equal(replayedWebhookResponse.headers['idempotency-replayed'], 'true');

      const paymentCount = await apiPool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM payments WHERE provider = 'stripe' AND provider_payment_id = $1`,
        [providerPaymentId],
      );
      assert.equal(paymentCount.rows[0].count, '1');

      const accessResponse = await app.inject({
        method: 'GET',
        url: `/api/enrollments/${courseId}/access`,
        headers: { authorization: `Bearer ${checkoutUser.accessToken}` },
      });
      assert.equal(accessResponse.statusCode, 200);
      const access = accessResponse.json() as { hasAccess: boolean; accessType: string | null };
      assert.equal(access.hasAccess, true);
      assert.equal(access.accessType, 'purchase');

      const progressResponse = await app.inject({
        method: 'PUT',
        url: `/api/progress/lessons/${lessonId}`,
        headers: { authorization: `Bearer ${checkoutUser.accessToken}` },
        payload: {
          status: 'completed',
          progressPercent: 100,
          watchPercent: 100,
          lastPositionSeconds: 1200,
          isCompleted: true,
        },
      });
      assert.equal(progressResponse.statusCode, 200);

      const reviewResponse = await app.inject({
        method: 'POST',
        url: '/api/reviews',
        headers: { authorization: `Bearer ${checkoutUser.accessToken}` },
        payload: {
          courseId,
          rating: 5,
          title: 'Integration review',
          body: 'Created by route-level integration test.',
        },
      });
      assert.equal(reviewResponse.statusCode, 201);
    });
  } finally {
    if (app) {
      await app.close();
    }
    if (apiPool) {
      await apiPool.end();
    }
    if (client) {
      await client.end();
    }
    await postgres.stop();
  }
});
