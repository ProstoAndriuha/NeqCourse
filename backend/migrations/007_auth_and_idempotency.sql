BEGIN;

ALTER TABLE users
ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT chk_users_token_version CHECK (token_version >= 0);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    token_version INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    user_agent TEXT,
    ip_address INET,
    revoke_reason VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_refresh_tokens_token_version CHECK (token_version >= 0),
    CONSTRAINT chk_refresh_tokens_revoked_after_create CHECK (
        revoked_at IS NULL OR revoked_at >= created_at
    )
);

CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    request_hash CHAR(64) NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    resource_type VARCHAR(64),
    resource_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_idempotency_scope_key UNIQUE (scope, idempotency_key),
    CONSTRAINT chk_idempotency_response_status CHECK (
        response_status IS NULL OR response_status >= 100
    ),
    CONSTRAINT chk_idempotency_expiry CHECK (expires_at >= created_at)
);

CREATE TRIGGER trg_refresh_tokens_set_updated_at
BEFORE UPDATE ON refresh_tokens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_idempotency_keys_set_updated_at
BEFORE UPDATE ON idempotency_keys
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(user_id, revoked_at, expires_at);
CREATE INDEX idx_idempotency_keys_user_scope ON idempotency_keys(user_id, scope);
CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);

COMMIT;
