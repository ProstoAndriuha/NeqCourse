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
