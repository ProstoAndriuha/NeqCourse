BEGIN;

CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    scope subscription_scope_enum NOT NULL DEFAULT 'all_courses',
    price_amount NUMERIC(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    billing_interval billing_interval_enum NOT NULL DEFAULT 'month',
    interval_count SMALLINT NOT NULL DEFAULT 1,
    trial_days INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_subscription_plans_price CHECK (price_amount >= 0),
    CONSTRAINT chk_subscription_plans_interval_count CHECK (interval_count > 0),
    CONSTRAINT chk_subscription_plans_trial_days CHECK (trial_days >= 0)
);

CREATE TABLE subscription_plan_courses (
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (plan_id, course_id)
);

CREATE TABLE promocodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL,
    description TEXT,
    status promocode_status_enum NOT NULL DEFAULT 'active',
    discount_type discount_type_enum NOT NULL,
    discount_value NUMERIC(10,2) NOT NULL,
    max_discount_amount NUMERIC(10,2),
    min_order_amount NUMERIC(10,2),
    usage_limit INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    per_user_limit INTEGER NOT NULL DEFAULT 1,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    applies_to promocode_scope_enum NOT NULL DEFAULT 'all_products',
    is_stackable BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_promocodes_discount_value CHECK (discount_value > 0),
    CONSTRAINT chk_promocodes_percent_value CHECK (
        discount_type <> 'percent' OR (discount_value > 0 AND discount_value <= 100)
    ),
    CONSTRAINT chk_promocodes_max_discount_amount CHECK (
        max_discount_amount IS NULL OR max_discount_amount >= 0
    ),
    CONSTRAINT chk_promocodes_min_order_amount CHECK (
        min_order_amount IS NULL OR min_order_amount >= 0
    ),
    CONSTRAINT chk_promocodes_usage_limit CHECK (
        usage_limit IS NULL OR usage_limit >= 0
    ),
    CONSTRAINT chk_promocodes_used_count CHECK (used_count >= 0),
    CONSTRAINT chk_promocodes_per_user_limit CHECK (per_user_limit > 0),
    CONSTRAINT chk_promocodes_usage_balance CHECK (
        usage_limit IS NULL OR used_count <= usage_limit
    ),
    CONSTRAINT chk_promocodes_date_range CHECK (
        starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at
    )
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    order_number VARCHAR(32) NOT NULL UNIQUE,
    status order_status_enum NOT NULL DEFAULT 'pending',
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    subtotal_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    promocode_id UUID REFERENCES promocodes(id) ON DELETE SET NULL,
    billing_email CITEXT NOT NULL,
    placed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_orders_subtotal_amount CHECK (subtotal_amount >= 0),
    CONSTRAINT chk_orders_discount_amount CHECK (discount_amount >= 0),
    CONSTRAINT chk_orders_tax_amount CHECK (tax_amount >= 0),
    CONSTRAINT chk_orders_total_amount CHECK (total_amount >= 0)
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type order_item_type_enum NOT NULL,
    course_id UUID REFERENCES courses(id) ON DELETE RESTRICT,
    subscription_plan_id UUID REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    title_snapshot VARCHAR(255) NOT NULL,
    item_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price_amount NUMERIC(10,2) NOT NULL,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    final_price_amount NUMERIC(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    access_duration_days INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_order_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_order_items_unit_price_amount CHECK (unit_price_amount >= 0),
    CONSTRAINT chk_order_items_discount_amount CHECK (discount_amount >= 0),
    CONSTRAINT chk_order_items_final_price_amount CHECK (final_price_amount >= 0),
    CONSTRAINT chk_order_items_access_duration_days CHECK (
        access_duration_days IS NULL OR access_duration_days > 0
    ),
    CONSTRAINT chk_order_items_target CHECK (
        (item_type = 'course' AND course_id IS NOT NULL AND subscription_plan_id IS NULL) OR
        (item_type = 'subscription' AND course_id IS NULL AND subscription_plan_id IS NOT NULL)
    )
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    provider payment_provider_enum NOT NULL,
    status payment_status_enum NOT NULL DEFAULT 'initiated',
    amount NUMERIC(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    provider_payment_id VARCHAR(191),
    provider_customer_id VARCHAR(191),
    idempotency_key VARCHAR(191) UNIQUE,
    payment_method_last4 VARCHAR(4),
    failure_reason TEXT,
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    receipt_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payments_amount CHECK (amount >= 0),
    CONSTRAINT uq_payments_provider_payment UNIQUE (provider, provider_payment_id)
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    status subscription_status_enum NOT NULL DEFAULT 'active',
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    canceled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    provider_customer_id VARCHAR(191),
    provider_subscription_id VARCHAR(191) UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_subscriptions_period_range CHECK (
        current_period_start <= current_period_end
    ),
    CONSTRAINT chk_subscriptions_end_after_start CHECK (
        ended_at IS NULL OR ended_at >= started_at
    )
);

CREATE TABLE promocode_courses (
    promocode_id UUID NOT NULL REFERENCES promocodes(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (promocode_id, course_id)
);

CREATE TRIGGER trg_subscription_plans_set_updated_at
BEFORE UPDATE ON subscription_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_promocodes_set_updated_at
BEFORE UPDATE ON promocodes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_set_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_order_items_set_updated_at
BEFORE UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payments_set_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subscriptions_set_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX uq_promocodes_code_active
    ON promocodes(code)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_subscription_plan_courses_course_id ON subscription_plan_courses(course_id);
CREATE INDEX idx_promocodes_status_dates ON promocodes(status, starts_at, ends_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_user_status_created_at ON orders(user_id, status, created_at DESC);
CREATE INDEX idx_orders_promocode_id ON orders(promocode_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_course_id ON order_items(course_id) WHERE course_id IS NOT NULL;
CREATE INDEX idx_order_items_subscription_plan_id ON order_items(subscription_plan_id) WHERE subscription_plan_id IS NOT NULL;
CREATE INDEX idx_payments_order_status ON payments(order_id, status);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_provider_customer_id ON payments(provider_customer_id) WHERE provider_customer_id IS NOT NULL;
CREATE INDEX idx_subscriptions_user_status_end ON subscriptions(user_id, status, current_period_end DESC);
CREATE UNIQUE INDEX uq_subscriptions_active_plan_per_user
    ON subscriptions(user_id, plan_id)
    WHERE status IN ('trialing', 'active', 'past_due');
CREATE INDEX idx_promocode_courses_course_id ON promocode_courses(course_id);

COMMIT;
