import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function main(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), 'backend', 'migrations');
  const schemaPath = path.resolve(process.cwd(), 'backend', 'schema.sql');

  const filenames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const contents = await Promise.all(
    filenames.map(async (filename) => {
      const fullPath = path.join(migrationsDir, filename);
      const sql = await readFile(fullPath, 'utf8');
      return `-- ${filename}\n${sql.trim()}`;
    }),
  );

  await writeFile(schemaPath, `${contents.join('\n\n')}\n`, 'utf8');
  console.log(`schema rebuilt from ${filenames.length} migrations`);
}

void main();
