import { createHash, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { env } from '../config/env';
import type { UserRole } from './roles';
import type { AuthTokenPayload } from './token';
import { signAuthToken, verifyAuthToken } from './token';

export type SessionUser = {
  id: string;
  role: UserRole;
  tokenVersion: number;
};

export type SessionMetadata = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type RefreshSession = {
  id: string;
  userId: string;
  tokenHash: string;
  tokenVersion: number;
  expiresAt: string;
  revokedAt: string | null;
  payload: AuthTokenPayload;
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueAccessToken(user: SessionUser): string {
  return signAuthToken(
    {
      sub: user.id,
      role: user.role,
      type: 'access',
      ver: user.tokenVersion,
    },
    env.ACCESS_TOKEN_TTL_SECONDS,
  );
}

export async function issueTokenPair(
  client: PoolClient,
  user: SessionUser,
  metadata: SessionMetadata,
): Promise<{ accessToken: string; refreshToken: string; accessTokenExpiresIn: number; refreshTokenExpiresIn: number }> {
  const refreshTokenId = randomUUID();
  const refreshToken = signAuthToken(
    {
      sub: user.id,
      role: user.role,
      type: 'refresh',
      ver: user.tokenVersion,
      jti: refreshTokenId,
    },
    env.REFRESH_TOKEN_TTL_SECONDS,
  );
  const accessToken = issueAccessToken(user);

  await client.query(
    `
      INSERT INTO refresh_tokens (
        id,
        user_id,
        token_hash,
        token_version,
        expires_at,
        user_agent,
        ip_address
      ) VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'), $6, $7)
    `,
    [
      refreshTokenId,
      user.id,
      hashToken(refreshToken),
      user.tokenVersion,
      env.REFRESH_TOKEN_TTL_SECONDS,
      metadata.userAgent ?? null,
      metadata.ipAddress ?? null,
    ],
  );

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresIn: env.REFRESH_TOKEN_TTL_SECONDS,
  };
}

export async function findRefreshSession(client: PoolClient, refreshToken: string): Promise<RefreshSession | null> {
  const payload = verifyAuthToken(refreshToken);
  if (!payload || payload.type !== 'refresh' || !payload.jti) {
    return null;
  }

  const tokenHash = hashToken(refreshToken);
  const result = await client.query<{
    id: string;
    user_id: string;
    token_version: number;
    expires_at: string;
    revoked_at: string | null;
  }>(
    `
      SELECT id, user_id, token_version, expires_at, revoked_at
      FROM refresh_tokens
      WHERE id = $1
        AND token_hash = $2
      FOR UPDATE
    `,
    [payload.jti, tokenHash],
  );

  if (result.rowCount !== 1) {
    return null;
  }

  const session = result.rows[0];
  if (session.revoked_at) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return {
    id: session.id,
    userId: session.user_id,
    tokenHash,
    tokenVersion: session.token_version,
    expiresAt: session.expires_at,
    revokedAt: session.revoked_at,
    payload,
  };
}

export async function rotateRefreshToken(
  client: PoolClient,
  session: RefreshSession,
  user: SessionUser,
  metadata: SessionMetadata,
): Promise<{ accessToken: string; refreshToken: string; accessTokenExpiresIn: number; refreshTokenExpiresIn: number }> {
  const nextTokens = await issueTokenPair(client, user, metadata);
  const nextPayload = verifyAuthToken(nextTokens.refreshToken);

  await client.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW(),
          last_used_at = NOW(),
          replaced_by_token_id = $2,
          revoke_reason = 'rotated'
      WHERE id = $1
    `,
    [session.id, nextPayload?.jti ?? null],
  );

  return nextTokens;
}

export async function revokeRefreshToken(
  client: PoolClient,
  refreshToken: string,
  userId: string,
  reason: string,
): Promise<boolean> {
  const payload = verifyAuthToken(refreshToken);
  if (!payload || payload.type !== 'refresh' || !payload.jti) {
    return false;
  }

  const tokenHash = hashToken(refreshToken);
  const result = await client.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = COALESCE(revoked_at, NOW()),
          last_used_at = NOW(),
          revoke_reason = COALESCE(revoke_reason, $4)
      WHERE id = $1
        AND user_id = $2
        AND token_hash = $3
    `,
    [payload.jti, userId, tokenHash, reason],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function revokeAllRefreshTokens(client: PoolClient, userId: string, reason: string): Promise<void> {
  await client.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = COALESCE(revoked_at, NOW()),
          revoke_reason = COALESCE(revoke_reason, $2)
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId, reason],
  );
}
