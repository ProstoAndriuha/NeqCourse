import { createHash } from 'node:crypto';

import type { PoolClient } from 'pg';

export type IdempotencyReplay = {
  kind: 'replay';
  statusCode: number;
  body: unknown;
};

export type IdempotencyReady = {
  kind: 'ready';
};

export type IdempotencyConflict = {
  kind: 'conflict';
  message: string;
};

export type IdempotencyResult = IdempotencyReplay | IdempotencyReady | IdempotencyConflict;

type BeginIdempotencyInput = {
  scope: string;
  idempotencyKey: string;
  userId?: string | null;
  requestPayload: unknown;
  ttlSeconds: number;
};

type CompleteIdempotencyInput = {
  scope: string;
  idempotencyKey: string;
  statusCode: number;
  body: unknown;
  resourceType?: string | null;
  resourceId?: string | null;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);

  return `{${entries.join(',')}}`;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function readIdempotencyKey(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    return null;
  }

  return normalized;
}

export async function beginIdempotentRequest(
  client: PoolClient,
  input: BeginIdempotencyInput,
): Promise<IdempotencyResult> {
  const requestHash = hashPayload(input.requestPayload);
  const existing = await client.query<{
    request_hash: string;
    response_status: number | null;
    response_body: unknown;
  }>(
    `
      SELECT request_hash, response_status, response_body
      FROM idempotency_keys
      WHERE scope = $1
        AND idempotency_key = $2
        AND expires_at > NOW()
      FOR UPDATE
    `,
    [input.scope, input.idempotencyKey],
  );

  if (existing.rowCount === 1) {
    const row = existing.rows[0];
    if (row.request_hash !== requestHash) {
      return {
        kind: 'conflict',
        message: 'Idempotency key reuse with a different request payload is not allowed',
      };
    }

    if (row.response_status !== null) {
      return {
        kind: 'replay',
        statusCode: row.response_status,
        body: row.response_body,
      };
    }

    return {
      kind: 'conflict',
      message: 'A request with this idempotency key is already being processed',
    };
  }

  await client.query(
    `
      INSERT INTO idempotency_keys (
        scope,
        idempotency_key,
        user_id,
        request_hash,
        expires_at
      ) VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'))
    `,
    [input.scope, input.idempotencyKey, input.userId ?? null, requestHash, input.ttlSeconds],
  );

  return { kind: 'ready' };
}

export async function completeIdempotentRequest(
  client: PoolClient,
  input: CompleteIdempotencyInput,
): Promise<void> {
  await client.query(
    `
      UPDATE idempotency_keys
      SET response_status = $3,
          response_body = $4::jsonb,
          resource_type = $5,
          resource_id = $6
      WHERE scope = $1
        AND idempotency_key = $2
    `,
    [
      input.scope,
      input.idempotencyKey,
      input.statusCode,
      JSON.stringify(input.body),
      input.resourceType ?? null,
      input.resourceId ?? null,
    ],
  );
}
