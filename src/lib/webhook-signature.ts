import { createHmac, timingSafeEqual } from 'node:crypto';

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

function getWebhookSecret(): string {
  return process.env.PAYMENTS_WEBHOOK_SECRET || 'dev-webhook-secret-change-me';
}

function getToleranceSeconds(): number {
  const raw = Number(process.env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS || 300);
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

function signBase(message: string): string {
  return createHmac('sha256', getWebhookSecret())
    .update(message)
    .digest('hex');
}

export function signWebhookPayload(payload: unknown, timestamp: string): string {
  return signBase(`${timestamp}.${stableStringify(payload)}`);
}

export function verifyWebhookSignature(payload: unknown, timestamp: string, signature: string): boolean {
  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }

  const ageSeconds = Math.abs(Date.now() - parsedTimestamp) / 1000;
  if (ageSeconds > getToleranceSeconds()) {
    return false;
  }

  const expected = signWebhookPayload(payload, timestamp);
  const provided = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
