import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import type { UserRole } from '../auth/roles';
import { verifyAuthToken } from '../auth/token';
import { pool } from '../db/pool';

async function resolveRequestAuth(request: FastifyRequest): Promise<void> {
  request.auth = null;

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return;
  }

  const payload = verifyAuthToken(token);
  if (!payload || payload.type !== 'access') {
    return;
  }

  const result = await pool.query<{
    id: string;
    role: UserRole;
    status: string;
    token_version: number;
    assigned_roles: string[];
  }>(
    `
      SELECT
        u.id,
        u.role::text AS role,
        u.status::text AS status,
        u.token_version,
        COALESCE(array_agg(ura.role::text) FILTER (WHERE ura.role IS NOT NULL), ARRAY[]::text[]) AS assigned_roles
      FROM users u
      LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
      LIMIT 1
    `,
    [payload.sub],
  );

  if (result.rowCount !== 1) {
    return;
  }

  const user = result.rows[0];
  if (user.status !== 'active' || user.token_version !== payload.ver) {
    return;
  }

  const roles = Array.from(new Set<UserRole>([user.role, ...(user.assigned_roles as UserRole[])]));
  request.auth = {
    userId: user.id,
    role: user.role,
    roles,
    tokenVersion: user.token_version,
  };
}

export function configureAuthContext(app: FastifyInstance): void {
  app.decorateRequest('auth', null);

  app.decorate('requireAuth', async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    if (!request.auth) {
      return reply.unauthorized('Authentication required');
    }
  });

  app.decorate('requireRoles', function requireRoles(roles: UserRole[]): preHandlerHookHandler {
    return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
      if (!request.auth) {
        return reply.unauthorized('Authentication required');
      }

      const hasRole = request.auth.roles.some((role) => roles.includes(role));
      if (!hasRole) {
        return reply.forbidden('Insufficient permissions');
      }
    };
  });

  app.addHook('onRequest', async (request) => {
    await resolveRequestAuth(request);
  });
}
