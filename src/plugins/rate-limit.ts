import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { getRedisClient } from '../support/redis';

type RateLimitOptions = {
  name: string;
  max: number;
  windowMs: number;
  keyGenerator?: (request: FastifyRequest) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function configureRateLimit(app: FastifyInstance): void {
  const buckets = new Map<string, Bucket>();

  function prune(now: number): void {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  app.decorate('rateLimit', function rateLimit(options: RateLimitOptions): preHandlerHookHandler {
    return async function rateLimitHandler(request: FastifyRequest, reply: FastifyReply) {
      const key = options.keyGenerator ? options.keyGenerator(request) : request.ip;
      const bucketKey = `${options.name}:${key}`;

      const redis = await getRedisClient();
      if (redis) {
        const redisKey = `ratelimit:${bucketKey}`;
        const count = await redis.incr(redisKey);
        if (count === 1) {
          await redis.pExpire(redisKey, options.windowMs);
        }

        if (count > options.max) {
          const ttlMs = await redis.pTTL(redisKey);
          reply.header('Retry-After', Math.max(1, Math.ceil(ttlMs / 1000)));
          return reply.tooManyRequests(`Rate limit exceeded for ${options.name}`);
        }

        return;
      }

      const now = Date.now();
      if (buckets.size > 1_000) {
        prune(now);
      }

      const existing = buckets.get(bucketKey);
      if (!existing || existing.resetAt <= now) {
        buckets.set(bucketKey, {
          count: 1,
          resetAt: now + options.windowMs,
        });
        return;
      }

      existing.count += 1;
      if (existing.count > options.max) {
        reply.header('Retry-After', Math.ceil((existing.resetAt - now) / 1000));
        return reply.tooManyRequests(`Rate limit exceeded for ${options.name}`);
      }
    };
  });
}
