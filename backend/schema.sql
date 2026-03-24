-- 001_extensions_and_enums.sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role_enum AS ENUM ('student', 'teacher', 'admin', 'moderator', 'manager');
CREATE TYPE user_status_enum AS ENUM ('pending', 'active', 'suspended', 'deleted');
CREATE TYPE teacher_status_enum AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE course_status_enum AS ENUM ('draft', 'review', 'published', 'archived');
CREATE TYPE course_level_enum AS ENUM ('beginner', 'intermediate', 'advanced', 'all_levels');
CREATE TYPE lesson_type_enum AS ENUM ('text', 'video', 'live', 'quiz', 'assignment', 'mixed');
CREATE TYPE lesson_status_enum AS ENUM ('draft', 'published', 'archived');
CREATE TYPE resource_type_enum AS ENUM ('video', 'pdf', 'image', 'file', 'link', 'subtitle', 'archive');
CREATE TYPE resource_access_enum AS ENUM ('public', 'enrolled', 'premium');
CREATE TYPE order_status_enum AS ENUM ('pending', 'awaiting_payment', 'paid', 'partially_refunded', 'refunded', 'canceled', 'failed', 'expired');
CREATE TYPE order_item_type_enum AS ENUM ('course', 'subscription');
CREATE TYPE payment_status_enum AS ENUM ('initiated', 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'canceled');
CREATE TYPE payment_provider_enum AS ENUM ('stripe', 'paypal', 'bank_transfer', 'manual');
CREATE TYPE discount_type_enum AS ENUM ('percent', 'fixed_amount');
CREATE TYPE promocode_status_enum AS ENUM ('active', 'paused', 'expired', 'depleted');
CREATE TYPE promocode_scope_enum AS ENUM ('all_products', 'all_courses', 'selected_courses', 'subscriptions');
CREATE TYPE enrollment_access_type_enum AS ENUM ('purchase', 'subscription', 'admin_grant', 'promocode', 'gift');
CREATE TYPE enrollment_status_enum AS ENUM ('active', 'completed', 'refunded', 'revoked', 'expired');
CREATE TYPE progress_status_enum AS ENUM ('not_started', 'in_progress', 'completed');
CREATE TYPE review_status_enum AS ENUM ('pending_moderation', 'published', 'hidden', 'rejected');
CREATE TYPE notification_type_enum AS ENUM ('system', 'order', 'payment', 'course', 'marketing', 'certificate');
CREATE TYPE notification_channel_enum AS ENUM ('in_app', 'email', 'push', 'sms');
CREATE TYPE notification_delivery_status_enum AS ENUM ('pending', 'sent', 'delivered', 'failed');
CREATE TYPE notification_read_status_enum AS ENUM ('unread', 'read', 'archived');
CREATE TYPE subscription_status_enum AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');
CREATE TYPE subscription_scope_enum AS ENUM ('all_courses', 'selected_courses');
CREATE TYPE billing_interval_enum AS ENUM ('month', 'quarter', 'year');
CREATE TYPE certificate_status_enum AS ENUM ('issued', 'revoked');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMIT;

-- 002_users_and_roles.sql
BEGIN;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(32),
    role user_role_enum NOT NULL DEFAULT 'student',
    status user_status_enum NOT NULL DEFAULT 'active',
    email_verified_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    avatar_url TEXT,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    locale VARCHAR(16) NOT NULL DEFAULT 'en',
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_role_assignments (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL,
    assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role)
);

CREATE TABLE teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(160) NOT NULL,
    headline VARCHAR(255),
    bio TEXT,
    avatar_url TEXT,
    website_url TEXT,
    expertise JSONB NOT NULL DEFAULT '[]'::jsonb,
    rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    status teacher_status_enum NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_teachers_rating_avg CHECK (rating_avg >= 0 AND rating_avg <= 5),
    CONSTRAINT chk_teachers_rating_count CHECK (rating_count >= 0)
);

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_teachers_set_updated_at
BEFORE UPDATE ON teachers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_user_role_assignments_role ON user_role_assignments(role);
CREATE INDEX idx_teachers_status ON teachers(status);

COMMIT;

-- 003_catalog.sql
BEGIN;

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    slug VARCHAR(140) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    short_description VARCHAR(500),
    description TEXT,
    status course_status_enum NOT NULL DEFAULT 'draft',
    visibility VARCHAR(20) NOT NULL DEFAULT 'public',
    level course_level_enum NOT NULL DEFAULT 'all_levels',
    language VARCHAR(16) NOT NULL DEFAULT 'en',
    price_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    compare_at_amount NUMERIC(10,2),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    thumbnail_url TEXT,
    preview_video_url TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    is_subscription_included BOOLEAN NOT NULL DEFAULT TRUE,
    certificate_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_courses_visibility CHECK (visibility IN ('public', 'private', 'unlisted')),
    CONSTRAINT chk_courses_price_amount CHECK (price_amount >= 0),
    CONSTRAINT chk_courses_compare_at_amount CHECK (
        compare_at_amount IS NULL OR compare_at_amount >= price_amount
    ),
    CONSTRAINT chk_courses_duration_minutes CHECK (duration_minutes >= 0),
    CONSTRAINT chk_courses_rating_avg CHECK (rating_avg >= 0 AND rating_avg <= 5),
    CONSTRAINT chk_courses_rating_count CHECK (rating_count >= 0)
);

CREATE TABLE course_categories (
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (course_id, category_id)
);

CREATE TABLE course_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_course_modules_sort_order CHECK (sort_order > 0)
);

CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    summary TEXT,
    body_markdown TEXT,
    lesson_type lesson_type_enum NOT NULL DEFAULT 'video',
    status lesson_status_enum NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    is_preview BOOLEAN NOT NULL DEFAULT FALSE,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_lessons_sort_order CHECK (sort_order > 0),
    CONSTRAINT chk_lessons_duration_seconds CHECK (duration_seconds >= 0)
);

CREATE TABLE lesson_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    resource_type resource_type_enum NOT NULL,
    title VARCHAR(255) NOT NULL,
    storage_provider VARCHAR(32) NOT NULL DEFAULT 's3',
    file_key TEXT,
    public_url TEXT,
    mime_type VARCHAR(127),
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    checksum_sha256 CHAR(64),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    access_level resource_access_enum NOT NULL DEFAULT 'enrolled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_lesson_resources_file_presence CHECK (
        file_key IS NOT NULL OR public_url IS NOT NULL
    ),
    CONSTRAINT chk_lesson_resources_file_size CHECK (
        file_size_bytes IS NULL OR file_size_bytes >= 0
    ),
    CONSTRAINT chk_lesson_resources_duration CHECK (
        duration_seconds IS NULL OR duration_seconds >= 0
    )
);

CREATE TRIGGER trg_categories_set_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_courses_set_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_course_modules_set_updated_at
BEFORE UPDATE ON course_modules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lessons_set_updated_at
BEFORE UPDATE ON lessons
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lesson_resources_set_updated_at
BEFORE UPDATE ON lesson_resources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX uq_courses_slug_active
    ON courses(slug)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_course_modules_course_sort_active
    ON course_modules(course_id, sort_order)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_lessons_module_sort_active
    ON lessons(module_id, sort_order)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_lessons_module_slug_active
    ON lessons(module_id, slug)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_is_active_sort_order ON categories(is_active, sort_order);
CREATE INDEX idx_courses_teacher_status ON courses(teacher_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_status_published_at ON courses(status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_subscription_included ON courses(is_subscription_included) WHERE deleted_at IS NULL;
CREATE INDEX idx_course_categories_category_id ON course_categories(category_id);
CREATE INDEX idx_course_modules_course_id ON course_modules(course_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lessons_module_id ON lessons(module_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lessons_status ON lessons(status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_lesson_resources_lesson_id ON lesson_resources(lesson_id);

COMMIT;

-- 004_orders_and_payments.sql
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

-- 005_enrollments_and_progress.sql
BEGIN;

CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    status enrollment_status_enum NOT NULL DEFAULT 'active',
    access_type enrollment_access_type_enum NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_ends_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_enrollments_user_course UNIQUE (user_id, course_id),
    CONSTRAINT chk_enrollments_progress CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),
    CONSTRAINT chk_enrollments_access_range CHECK (
        access_ends_at IS NULL OR access_starts_at <= access_ends_at
    )
);

CREATE TABLE progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
    status progress_status_enum NOT NULL DEFAULT 'not_started',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    watch_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    last_position_seconds INTEGER NOT NULL DEFAULT 0,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_progress_user_lesson UNIQUE (user_id, lesson_id),
    CONSTRAINT chk_progress_progress_percent CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),
    CONSTRAINT chk_progress_watch_percent CHECK (
        watch_percent >= 0 AND watch_percent <= 100
    ),
    CONSTRAINT chk_progress_last_position_seconds CHECK (last_position_seconds >= 0),
    CONSTRAINT chk_progress_time_spent_seconds CHECK (time_spent_seconds >= 0)
);

CREATE TRIGGER trg_enrollments_set_updated_at
BEFORE UPDATE ON enrollments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_progress_set_updated_at
BEFORE UPDATE ON progress
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_enrollments_user_status ON enrollments(user_id, status);
CREATE INDEX idx_enrollments_course_status ON enrollments(course_id, status);
CREATE INDEX idx_enrollments_subscription_id ON enrollments(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_progress_user_course_status ON progress(user_id, course_id, status);
CREATE INDEX idx_progress_lesson_id ON progress(lesson_id);

COMMIT;

-- 006_reviews_notifications_certificates.sql
BEGIN;

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL,
    title VARCHAR(160),
    body TEXT,
    status review_status_enum NOT NULL DEFAULT 'pending_moderation',
    is_verified_purchase BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reviews_user_course UNIQUE (user_id, course_id),
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
    certificate_number VARCHAR(64) NOT NULL UNIQUE,
    verification_code VARCHAR(64) NOT NULL UNIQUE,
    status certificate_status_enum NOT NULL DEFAULT 'issued',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    file_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_certificates_user_course UNIQUE (user_id, course_id)
);

CREATE TABLE favorites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type_enum NOT NULL DEFAULT 'system',
    channel notification_channel_enum NOT NULL DEFAULT 'in_app',
    delivery_status notification_delivery_status_enum NOT NULL DEFAULT 'pending',
    read_status notification_read_status_enum NOT NULL DEFAULT 'unread',
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_url TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_reviews_set_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_certificates_set_updated_at
BEFORE UPDATE ON certificates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notifications_set_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_reviews_course_status ON reviews(course_id, status, created_at DESC);
CREATE INDEX idx_certificates_verification_code ON certificates(verification_code);
CREATE INDEX idx_favorites_course_id ON favorites(course_id);
CREATE INDEX idx_notifications_user_status_created_at ON notifications(user_id, read_status, delivery_status, created_at DESC);

COMMIT;

-- 007_auth_and_idempotency.sql
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
