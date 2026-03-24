-- Run after schema.sql and seed.sql.
-- This file contains SQL checks for the main business flows.

-- 1. Purchase flow: order + payment + priced item snapshot.
SELECT
    o.order_number,
    o.status AS order_status,
    p.status AS payment_status,
    oi.title_snapshot,
    oi.unit_price_amount,
    oi.discount_amount,
    oi.final_price_amount
FROM orders o
JOIN payments p ON p.order_id = o.id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.order_number = 'ORD-20260316-0001';

-- 2. Enrollment granted after purchase.
SELECT
    u.email,
    c.slug,
    e.access_type,
    e.status,
    e.access_starts_at,
    e.access_ends_at
FROM enrollments e
JOIN users u ON u.id = e.user_id
JOIN courses c ON c.id = e.course_id
WHERE u.email = 'student@neqcourse.com'
  AND c.slug = 'postgresql-for-backend-developers';

-- 3. Subscription access to the same course.
SELECT
    u.email,
    s.status AS subscription_status,
    e.access_type,
    e.access_ends_at
FROM subscriptions s
JOIN users u ON u.id = s.user_id
JOIN enrollments e ON e.subscription_id = s.id
WHERE u.email = 'subscriber@neqcourse.com';

-- 4. Progress update example, wrapped in a rollback-safe transaction.
BEGIN;

UPDATE progress
SET
    status = 'completed',
    is_completed = TRUE,
    progress_percent = 100,
    watch_percent = 100,
    completed_at = NOW(),
    last_viewed_at = NOW()
WHERE lesson_id = (
    SELECT l.id
    FROM lessons l
    WHERE l.slug = 'er-design-for-course-platform'
    LIMIT 1
)
RETURNING status, is_completed, progress_percent, watch_percent;

ROLLBACK;

-- 5. Existing certificate validation.
SELECT
    certificate_number,
    verification_code,
    status,
    issued_at
FROM certificates
WHERE certificate_number = 'CERT-20260316-0001';

-- 6. Applied promocode on a paid order.
SELECT
    p.code,
    p.discount_type,
    p.discount_value,
    o.discount_amount,
    o.total_amount
FROM promocodes p
JOIN orders o ON o.promocode_id = p.id
WHERE p.code = 'SPRING20'
  AND o.order_number = 'ORD-20260316-0001';
