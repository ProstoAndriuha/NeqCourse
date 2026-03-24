import { runAuthGc } from '../../src/lib/auth-gc';

async function main(): Promise<void> {
  const result = await runAuthGc();
  console.log(JSON.stringify(result));
}

void main();
