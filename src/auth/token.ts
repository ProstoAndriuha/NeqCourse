import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../config/env';
import type { UserRole } from './roles';

export type TokenKind = 'access' | 'refresh';

export type AuthTokenPayload = {
  sub: string;
  role: UserRole;
  type: TokenKind;
  ver: number;
  exp: number;
  iat: number;
  jti?: string;
};

type SignTokenInput = {
  sub: string;
  role: UserRole;
  type: TokenKind;
  ver: number;
  jti?: string;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function signAuthToken(payload: SignTokenInput, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const encodedPayload = toBase64Url(JSON.stringify(fullPayload));
  const signature = createHmac('sha256', env.APP_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac('sha256', env.APP_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const provided = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as AuthTokenPayload;
    const isValidType = payload.type === 'access' || payload.type === 'refresh';

    if (!payload.sub || !payload.role || !payload.exp || !payload.iat || !isValidType) {
      return null;
    }

    if (!Number.isInteger(payload.ver) || payload.ver < 0) {
      return null;
    }

    if (payload.type === 'refresh' && !payload.jti) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
