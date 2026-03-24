import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Client } from 'pg';

import { env } from '../../src/config/env';

const migrationsDir = path.resolve(process.cwd(), 'backend', 'migrations');

function getChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '');
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

function isConnectionRefused(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ECONNREFUSED';
}

async function main(): Promise<void> {
  const client = new Client({
    connectionString: env.DATABASE_URL,
  });

  try {
    await client.connect();
  } catch (error) {
    if (isConnectionRefused(error)) {
      const url = new URL(env.DATABASE_URL);
      throw new Error(
        `PostgreSQL is not running at ${url.hostname}:${url.port || '5432'}. Start it first with: npm run db:dev:start`,
      );
    }

    throw error;
  }

  try {
    await ensureMigrationsTable(client);

    const filenames = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const filename of filenames) {
      const fullPath = path.join(migrationsDir, filename);
      const sql = stripBom(await readFile(fullPath, 'utf8'));
      const checksum = getChecksum(sql);

      const existing = await client.query<{
        checksum: string;
      }>(
        `SELECT checksum FROM backend_migrations WHERE filename = $1`,
        [filename],
      );

      if (existing.rowCount === 1) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${filename}`);
        }

        console.log(`skip ${filename}`);
        continue;
      }

      console.log(`apply ${filename}`);
      await client.query(sql);
      await client.query(
        `INSERT INTO backend_migrations (filename, checksum) VALUES ($1, $2)`,
        [filename, checksum],
      );
    }
  } finally {
    await client.end();
  }
}

void main();
