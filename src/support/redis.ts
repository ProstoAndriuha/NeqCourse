import { createClient } from 'redis';

import { env } from '../config/env';

type AppRedisClient = ReturnType<typeof createClient>;

let redisClientPromise: Promise<AppRedisClient | null> | null = null;

export async function getRedisClient(): Promise<AppRedisClient | null> {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({ url: env.REDIS_URL });
      client.on('error', (error) => {
        console.error('[redis]', error);
      });

      try {
        await client.connect();
        return client;
      } catch (error) {
        console.error('[redis-connect-failed]', error);
        try {
          await client.disconnect();
        } catch {
          // ignore
        }
        return null;
      }
    })();
  }

  return redisClientPromise;
}

export async function closeRedisClient(): Promise<void> {
  if (!redisClientPromise) {
    return;
  }

  const client = await redisClientPromise;
  redisClientPromise = null;

  if (client?.isOpen) {
    await client.quit();
  }
}
