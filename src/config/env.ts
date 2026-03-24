import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const optionalUrl = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}, z.string().url().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  APP_SECRET: z.string().min(16).default('dev-secret-change-me'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 15),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  REDIS_URL: optionalUrl,
  PAYMENTS_WEBHOOK_SECRET: z.string().min(16).default('dev-webhook-secret-change-me'),
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_GC_INTERVAL_MS: z.coerce.number().int().nonnegative().default(0),
  AUTH_GC_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  ENABLE_DEMO_PAYMENTS: z.coerce.boolean().default(true),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
