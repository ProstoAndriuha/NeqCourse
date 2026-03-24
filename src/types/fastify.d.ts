import 'fastify';

import type { UserRole } from '../auth/roles';
import type { RequestAuth } from '../auth/request-auth';

type RateLimitOptions = {
  name: string;
  max: number;
  windowMs: number;
  keyGenerator?: (request: import('fastify').FastifyRequest) => string;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuth | null;
  }

  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireRoles: (roles: UserRole[]) => import('fastify').preHandlerHookHandler;
    rateLimit: (options: RateLimitOptions) => import('fastify').preHandlerHookHandler;
  }
}
