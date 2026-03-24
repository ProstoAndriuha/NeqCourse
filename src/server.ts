import { buildApp } from './app';
import { env } from './config/env';
import { scheduleAuthGc } from './lib/auth-gc';
import { closeRedisClient } from './support/redis';

async function bootstrap(): Promise<void> {
  const app = buildApp();
  const gcTimer = scheduleAuthGc(app.log);

  const shutdown = async () => {
    if (gcTimer) {
      clearInterval(gcTimer);
    }

    await closeRedisClient();
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
  } catch (error) {
    app.log.error(error);
    if (gcTimer) {
      clearInterval(gcTimer);
    }
    await closeRedisClient();
    process.exit(1);
  }
}

void bootstrap();
