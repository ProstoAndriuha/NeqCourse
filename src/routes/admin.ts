import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ADMINISTRATION_ROLES } from '../auth/roles';
import { hashPassword } from '../auth/password';
import { pool } from '../db/pool';
import { normalizeSeededCourseTitle } from '../lib/seeded-course-fallbacks';

const userParamsSchema = z.object({
  userId: z.uuid(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['student', 'teacher', 'admin']),
});

const updateRoleSchema = z.object({
  role: z.enum(['student', 'teacher', 'admin']),
});

const createCourseSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  shortDescription: z.string().max(500).optional(),
  description: z.string().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'all_levels']).default('all_levels'),
  priceAmount: z.number().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  status: z.enum(['draft', 'published']).default('draft'),
});

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/overview', {
    preHandler: [app.requireAuth, app.requireRoles(ADMINISTRATION_ROLES)],
  }, async () => {
    const [statsResult, usersResult, coursesResult] = await Promise.all([
      pool.query<{
        total_users: string;
        students: string;
        admins: string;
        new_today: string;
      }>(`
        SELECT
          COUNT(*)::text AS total_users,
          COUNT(*) FILTER (WHERE role = 'student')::text AS students,
          COUNT(*) FILTER (WHERE role IN ('admin', 'manager'))::text AS admins,
          COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::text AS new_today
        FROM users
      `),
      pool.query<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
        status: string;
        created_at: string;
        enrolled_courses: string;
      }>(`
        SELECT
          u.id,
          u.email::text AS email,
          u.first_name,
          u.last_name,
          u.role::text AS role,
          u.status::text AS status,
          u.created_at,
          COUNT(DISTINCT e.id)::text AS enrolled_courses
        FROM users u
        LEFT JOIN enrollments e ON e.user_id = u.id AND e.status IN ('active', 'completed')
        GROUP BY u.id
        ORDER BY u.created_at DESC, u.email ASC
      `),
      pool.query<{
        id: string;
        slug: string;
        title: string;
        level: string;
        status: string;
        price_amount: string;
        categories: string[] | null;
      }>(`
        SELECT
          c.id,
          c.slug,
          c.title,
          c.level::text AS level,
          c.status::text AS status,
          c.price_amount::text AS price_amount,
          array_remove(array_agg(DISTINCT cat.name) FILTER (WHERE cat.name IS NOT NULL), NULL) AS categories
        FROM courses c
        LEFT JOIN course_categories cc ON cc.course_id = c.id
        LEFT JOIN categories cat ON cat.id = cc.category_id
        WHERE c.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `),
    ]);

    const stats = statsResult.rows[0] ?? {
      total_users: '0',
      students: '0',
      admins: '0',
      new_today: '0',
    };

    return {
      stats: {
        totalUsers: Number(stats.total_users),
        students: Number(stats.students),
        admins: Number(stats.admins),
        newToday: Number(stats.new_today),
      },
      users: usersResult.rows.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        name: `${row.first_name} ${row.last_name}`.trim(),
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
        enrolledCourses: Number(row.enrolled_courses),
      })),
      courses: coursesResult.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: normalizeSeededCourseTitle(row.slug, row.title),
        level: row.level,
        status: row.status,
        priceAmount: Number(row.price_amount),
        categories: row.categories ?? [],
      })),
    };
  });

  app.delete('/api/admin/users/:userId', {
    preHandler: [app.requireAuth, app.requireRoles(ADMINISTRATION_ROLES)],
  }, async (request, reply) => {
    const params = userParamsSchema.parse(request.params);

    if (params.userId === request.auth!.userId) {
      return reply.forbidden('You cannot delete your own account');
    }

    const protectedUser = await pool.query<{ role: string }>(
      `SELECT role::text AS role FROM users WHERE id = $1`,
      [params.userId],
    );

    if (protectedUser.rowCount !== 1) {
      return reply.notFound('User not found');
    }

    if (protectedUser.rows[0].role === 'admin' || protectedUser.rows[0].role === 'manager') {
      return reply.forbidden('You cannot delete another administrator');
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [params.userId]);

    return {
      deleted: true,
      userId: params.userId,
    };
  });

  // ── Create user (admin) ──────────────────────────────────
  app.post('/api/admin/users', {
    preHandler: [app.requireAuth, app.requireRoles(ADMINISTRATION_ROLES)],
  }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const passwordHash = await hashPassword(body.password);

    const existing = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [body.email],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.conflict('A user with this email already exists');
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
       VALUES ($1, $2, $3, $4, $5::user_role_enum, 'active', NOW())
       RETURNING id`,
      [body.email, passwordHash, body.firstName, body.lastName, body.role],
    );

    const userId = result.rows[0].id;

    await pool.query(
      `INSERT INTO user_role_assignments (user_id, role, assigned_by_user_id)
       VALUES ($1, $2::user_role_enum, $3)`,
      [userId, body.role, request.auth!.userId],
    );

    if (body.role === 'teacher') {
      await pool.query(
        `INSERT INTO teachers (user_id, display_name)
         VALUES ($1, $2)`,
        [userId, `${body.firstName} ${body.lastName}`.trim()],
      );
    }

    return { created: true, userId };
  });

  // ── Update user role ─────────────────────────────────────
  app.patch('/api/admin/users/:userId/role', {
    preHandler: [app.requireAuth, app.requireRoles(ADMINISTRATION_ROLES)],
  }, async (request, reply) => {
    const params = userParamsSchema.parse(request.params);
    const body = updateRoleSchema.parse(request.body);

    if (params.userId === request.auth!.userId) {
      return reply.forbidden('You cannot change your own role');
    }

    const user = await pool.query<{ role: string; first_name: string; last_name: string }>(
      `SELECT role::text AS role, first_name, last_name FROM users WHERE id = $1`,
      [params.userId],
    );
    if (user.rowCount !== 1) {
      return reply.notFound('User not found');
    }

    const oldRole = user.rows[0].role;

    await pool.query(
      `UPDATE users SET role = $1::user_role_enum, updated_at = NOW() WHERE id = $2`,
      [body.role, params.userId],
    );

    await pool.query(
      `DELETE FROM user_role_assignments WHERE user_id = $1 AND role = $2::user_role_enum`,
      [params.userId, oldRole],
    );
    await pool.query(
      `INSERT INTO user_role_assignments (user_id, role, assigned_by_user_id)
       VALUES ($1, $2::user_role_enum, $3)
       ON CONFLICT DO NOTHING`,
      [params.userId, body.role, request.auth!.userId],
    );

    if (body.role === 'teacher') {
      const teacherExists = await pool.query(
        `SELECT id FROM teachers WHERE user_id = $1`,
        [params.userId],
      );
      if (!teacherExists.rowCount || teacherExists.rowCount === 0) {
        const row = user.rows[0];
        await pool.query(
          `INSERT INTO teachers (user_id, display_name) VALUES ($1, $2)`,
          [params.userId, `${row.first_name} ${row.last_name}`.trim()],
        );
      }
    }

    return { updated: true, userId: params.userId, role: body.role };
  });

  // ── Create course (admin) ────────────────────────────────
  app.post('/api/admin/courses', {
    preHandler: [app.requireAuth, app.requireRoles(ADMINISTRATION_ROLES)],
  }, async (request, reply) => {
    const body = createCourseSchema.parse(request.body);

    const existingSlug = await pool.query(
      `SELECT id FROM courses WHERE slug = $1`,
      [body.slug],
    );
    if (existingSlug.rowCount && existingSlug.rowCount > 0) {
      return reply.conflict('A course with this slug already exists');
    }

    // Admin needs a teacher record; use theirs or create one
    let teacherResult = await pool.query<{ id: string }>(
      `SELECT id FROM teachers WHERE user_id = $1`,
      [request.auth!.userId],
    );
    if (!teacherResult.rowCount || teacherResult.rowCount === 0) {
      const adminUser = await pool.query<{ first_name: string; last_name: string }>(
        `SELECT first_name, last_name FROM users WHERE id = $1`,
        [request.auth!.userId],
      );
      const name = adminUser.rows[0]
        ? `${adminUser.rows[0].first_name} ${adminUser.rows[0].last_name}`.trim()
        : 'Admin';
      await pool.query(
        `INSERT INTO teachers (user_id, display_name) VALUES ($1, $2)`,
        [request.auth!.userId, name],
      );
      teacherResult = await pool.query<{ id: string }>(
        `SELECT id FROM teachers WHERE user_id = $1`,
        [request.auth!.userId],
      );
    }

    const teacherId = teacherResult.rows[0].id;

    const result = await pool.query<{ id: string }>(
      `INSERT INTO courses (teacher_id, created_by_user_id, updated_by_user_id,
         title, slug, short_description, description, status, level, price_amount, currency,
         published_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7::course_status_enum, $8::course_level_enum, $9, $10,
         CASE WHEN $7 = 'published' THEN NOW() ELSE NULL END)
       RETURNING id`,
      [
        teacherId, request.auth!.userId,
        body.title, body.slug,
        body.shortDescription ?? null, body.description ?? null,
        body.status, body.level,
        body.priceAmount, body.currency,
      ],
    );

    return { created: true, courseId: result.rows[0].id };
  });

  // ── Delete course (admin) ────────────────────────────────
  app.delete('/api/admin/courses/:courseId', {
    preHandler: [app.requireAuth, app.requireRoles(ADMINISTRATION_ROLES)],
  }, async (request, reply) => {
    const params = z.object({ courseId: z.uuid() }).parse(request.params);

    const course = await pool.query(
      `SELECT id FROM courses WHERE id = $1 AND deleted_at IS NULL`,
      [params.courseId],
    );
    if (course.rowCount !== 1) {
      return reply.notFound('Course not found');
    }

    await pool.query(
      `UPDATE courses SET deleted_at = NOW(), status = 'archived', updated_at = NOW() WHERE id = $1`,
      [params.courseId],
    );

    return { deleted: true, courseId: params.courseId };
  });
}
