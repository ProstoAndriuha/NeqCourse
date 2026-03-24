import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const dataDir = path.resolve(rootDir, '.local', 'embedded-postgres-dev');
const port = 55434;
const user = 'postgres';
const password = 'postgres';
const database = 'neqcourse_dev';

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function removeStalePostmasterPid(): Promise<void> {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!(await pathExists(pidFile))) {
    return;
  }

  const content = await readFile(pidFile, 'utf8');
  const pid = Number(content.split(/\r?\n/, 1)[0]?.trim());
  if (!Number.isFinite(pid) || pid <= 0) {
    await rm(pidFile, { force: true });
    return;
  }

  try {
    process.kill(pid, 0);
  } catch {
    await rm(pidFile, { force: true });
  }
}

async function main(): Promise<void> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pgVersionPath = path.join(dataDir, 'PG_VERSION');

  await mkdir(path.dirname(dataDir), { recursive: true });
  await removeStalePostmasterPid();

  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    persistent: true,
    initdbFlags: ['--encoding=UTF8'],
    onLog: (message: string) => console.log(`[embedded-postgres-dev] ${message}`),
    onError: (message: unknown) => console.error(`[embedded-postgres-dev] ${String(message)}`),
  });

  const shutdown = async () => {
    await postgres.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });

  if (!(await pathExists(pgVersionPath))) {
    await postgres.initialise();
  }

  await postgres.start();

  try {
    await postgres.createDatabase(database);
  } catch {
    // database already exists
  }

  console.log(`embedded postgres ready at postgres://${user}:${password}@127.0.0.1:${port}/${database}`);
  process.stdin.resume();
}

void main();
