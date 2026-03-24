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
