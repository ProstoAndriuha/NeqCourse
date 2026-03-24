import { env } from '../config/env';
import { pool } from '../db/pool';

type GcLogger = {
  info: (payload: unknown, message?: string) => void;
  error: (error: unknown, message?: string) => void;
};

export async function runAuthGc(): Promise<{ refreshTokensDeleted: number; idempotencyKeysDeleted: number }> {
  const retentionDays = env.AUTH_GC_RETENTION_DAYS;

  const refreshResult = await pool.query(
    `
      DELETE FROM refresh_tokens
      WHERE expires_at < NOW() - ($1 * INTERVAL '1 day')
         OR (revoked_at IS NOT NULL AND revoked_at < NOW() - ($1 * INTERVAL '1 day'))
    `,
    [retentionDays],
  );

  const idempotencyResult = await pool.query(
    `
      DELETE FROM idempotency_keys
      WHERE expires_at < NOW()
    `,
  );

  return {
    refreshTokensDeleted: refreshResult.rowCount ?? 0,
    idempotencyKeysDeleted: idempotencyResult.rowCount ?? 0,
  };
}

export function scheduleAuthGc(logger: GcLogger): NodeJS.Timeout | null {
  if (env.AUTH_GC_INTERVAL_MS <= 0) {
    return null;
  }

  return setInterval(() => {
    void runAuthGc()
      .then((result) => {
        logger.info({ authGc: result }, 'auth gc completed');
      })
      .catch((error) => {
        logger.error(error, 'auth gc failed');
      });
  }, env.AUTH_GC_INTERVAL_MS);
}
