import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Client } from 'pg';

import { env } from '../../src/config/env';

function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '');
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    const seedPath = path.resolve(process.cwd(), 'backend', 'seed.sql');
    const sql = stripBom(await readFile(seedPath, 'utf8'));
    await client.query(sql);
    console.log('seed applied');
  } finally {
    await client.end();
  }
}

void main();
