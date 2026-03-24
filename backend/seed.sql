BEGIN;

-- Only admin user. Password: Admin@2026
INSERT INTO users (
    email,
    password_hash,
    first_name,
    last_name,
    role,
    status,
    email_verified_at,
    locale
) VALUES (
    'admin@neqcourse.com',
    'scrypt$7773c18ab7e39d72e6d7c52253ae7ab1$b4a5521a28e278cb57acd15d2d62cda9c4ce1009e9afbb05370d3851086788fee81cbb84e8d10e694900091ccf522d7b157130e2db5fdfde19547a99d3382a6a',
    'System',
    'Admin',
    'admin',
    'active',
    NOW(),
    'ro'
);

INSERT INTO user_role_assignments (user_id, role, assigned_by_user_id)
SELECT id, 'admin'::user_role_enum, id FROM users WHERE email = 'admin@neqcourse.com';

COMMIT;




