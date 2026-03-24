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
