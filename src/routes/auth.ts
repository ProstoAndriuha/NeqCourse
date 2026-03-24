import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { hashPassword, verifyPassword } from '../auth/password';
import { issueTokenPair, findRefreshSession, revokeAllRefreshTokens, revokeRefreshToken, rotateRefreshToken } from '../auth/session';
import type { UserRole } from '../auth/roles';
import { pool } from '../db/pool';

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(32),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(32),
});

function buildSessionMetadata(request: FastifyRequest): { userAgent: string | null; ipAddress: string | null } {
  const userAgent = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;
  const ipAddress = request.ip ?? null;
  return { userAgent, ipAddress };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', {
    preHandler: app.rateLimit({
      name: 'auth:register',
      max: 5,
      windowMs: 10 * 60 * 1000,
    }),
  }, async (request, reply) => {
    const payload = registerSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const passwordHash = await hashPassword(payload.password);

      const existingUser = await client.query<{
        id: string;
        email: string;
        role: UserRole;
        status: string;
        first_name: string;
        last_name: string;
      }>(
        `
          SELECT id, email::text AS email, role::text AS role, status::text AS status, first_name, last_name
          FROM users
          WHERE email = $1
          FOR UPDATE
        `,
        [payload.email],
      );

      if (existingUser.rowCount === 1) {
        const user = existingUser.rows[0];

        if (user.status === 'suspended' && user.role === 'student') {
          const reactivatedUser = await client.query<{
            id: string;
            email: string;
            role: UserRole;
            first_name: string;
            last_name: string;
          }>(
            `
              UPDATE users
              SET password_hash = $2,
                  first_name = $3,
                  last_name = $4,
                  status = 'active',
                  token_version = token_version + 1,
                  updated_at = NOW()
              WHERE id = $1
              RETURNING id, email::text AS email, role::text AS role, first_name, last_name
            `,
            [user.id, passwordHash, payload.firstName, payload.lastName],
          );

          await client.query(
            `INSERT INTO user_role_assignments (user_id, role) VALUES ($1, 'student') ON CONFLICT DO NOTHING`,
            [user.id],
          );

          await client.query('COMMIT');

          return reply.send({
            reactivated: true,
            user: {
              id: reactivatedUser.rows[0].id,
              email: reactivatedUser.rows[0].email,
              role: reactivatedUser.rows[0].role,
              firstName: reactivatedUser.rows[0].first_name,
              lastName: reactivatedUser.rows[0].last_name,
            },
          });
        }

        return reply.conflict('An account with this email already exists');
      }

      const insertUser = await client.query<{
        id: string;
        email: string;
        role: UserRole;
        first_name: string;
        last_name: string;
      }>(
        `
          INSERT INTO users (email, password_hash, first_name, last_name, role, status)
          VALUES ($1, $2, $3, $4, 'student', 'active')
          RETURNING id, email::text AS email, role::text AS role, first_name, last_name
        `,
        [payload.email, passwordHash, payload.firstName, payload.lastName],
      );

      await client.query(
        `INSERT INTO user_role_assignments (user_id, role) VALUES ($1, 'student') ON CONFLICT DO NOTHING`,
        [insertUser.rows[0].id],
      );

      await client.query('COMMIT');

      return reply.code(201).send({
        user: {
          id: insertUser.rows[0].id,
          email: insertUser.rows[0].email,
          role: insertUser.rows[0].role,
          firstName: insertUser.rows[0].first_name,
          lastName: insertUser.rows[0].last_name,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/login', {
    preHandler: app.rateLimit({
      name: 'auth:login',
      max: 10,
      windowMs: 10 * 60 * 1000,
      keyGenerator: (request) => {
        const body = typeof request.body === 'object' && request.body ? request.body as { email?: string } : {};
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : 'anonymous';
        return `${request.ip}:${email}`;
      },
    }),
  }, async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const client = await pool.connect();

    try {
      const result = await client.query<{
        id: string;
        email: string;
        role: UserRole;
        password_hash: string;
        status: string;
        token_version: number;
        first_name: string;
        last_name: string;
      }>(
        `
          SELECT id, email::text AS email, role::text AS role, password_hash, status::text AS status, token_version, first_name, last_name
          FROM users
          WHERE email = $1
        `,
        [payload.email],
      );

      if (result.rowCount !== 1) {
        return reply.unauthorized('Invalid credentials');
      }

      const user = result.rows[0];
      if (user.status === 'suspended') {
        return reply.forbidden('Account suspended. Register again with the same email to reactivate it.');
      }

      if (user.status !== 'active') {
        return reply.forbidden(`Account status ${user.status} does not allow login`);
      }

      const valid = await verifyPassword(payload.password, user.password_hash);
      if (!valid) {
        return reply.unauthorized('Invalid credentials');
      }

      await client.query('BEGIN');
      await client.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
      const tokens = await issueTokenPair(client, {
        id: user.id,
        role: user.role,
        tokenVersion: user.token_version,
      }, buildSessionMetadata(request));
      await client.query('COMMIT');

      return reply.send({
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.first_name,
          lastName: user.last_name,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/refresh', {
    preHandler: app.rateLimit({
      name: 'auth:refresh',
      max: 20,
      windowMs: 10 * 60 * 1000,
    }),
  }, async (request, reply) => {
    const payload = refreshSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const session = await findRefreshSession(client, payload.refreshToken);
      if (!session) {
        throw app.httpErrors.unauthorized('Invalid refresh token');
      }

      const userResult = await client.query<{
        id: string;
        email: string;
        role: UserRole;
        status: string;
        token_version: number;
        first_name: string;
        last_name: string;
      }>(
        `
          SELECT id, email::text AS email, role::text AS role, status::text AS status, token_version, first_name, last_name
          FROM users
          WHERE id = $1
          FOR UPDATE
        `,
        [session.userId],
      );

      if (userResult.rowCount !== 1) {
        throw app.httpErrors.unauthorized('Invalid refresh token');
      }

      const user = userResult.rows[0];
      if (user.status !== 'active' || user.token_version !== session.payload.ver || user.token_version !== session.tokenVersion) {
        throw app.httpErrors.unauthorized('Refresh token has been revoked');
      }

      const tokens = await rotateRefreshToken(client, session, {
        id: user.id,
        role: user.role,
        tokenVersion: user.token_version,
      }, buildSessionMetadata(request));
      await client.query('COMMIT');

      return reply.send({
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.first_name,
          lastName: user.last_name,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/logout', {
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    const payload = logoutSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await revokeRefreshToken(client, payload.refreshToken, request.auth!.userId, 'logout');
      await client.query('COMMIT');

      return reply.send({
        loggedOut: true,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/logout-all', {
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const versionResult = await client.query<{ token_version: number }>(
        `
          UPDATE users
          SET token_version = token_version + 1
          WHERE id = $1
          RETURNING token_version
        `,
        [request.auth!.userId],
      );
      await revokeAllRefreshTokens(client, request.auth!.userId, 'logout_all');
      await client.query('COMMIT');

      return reply.send({
        loggedOutAll: true,
        tokenVersion: versionResult.rows[0].token_version,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
