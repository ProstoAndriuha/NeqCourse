import type { FastifyInstance } from 'fastify';

import { LEARNER_ROLES } from '../auth/roles';
import { pool } from '../db/pool';
import { normalizeSeededCourseTitle } from '../lib/seeded-course-fallbacks';

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/me', {
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    const result = await pool.query<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      status: string;
    }>(
      `
        SELECT id, email::text AS email, first_name, last_name, role::text AS role, status::text AS status
        FROM users
        WHERE id = $1
      `,
      [request.auth!.userId],
    );

    if (result.rowCount !== 1) {
      return reply.notFound('User not found');
    }

    return {
      id: result.rows[0].id,
      email: result.rows[0].email,
      firstName: result.rows[0].first_name,
      lastName: result.rows[0].last_name,
      role: result.rows[0].role,
      roles: request.auth!.roles,
      status: result.rows[0].status,
    };
  });

  app.get('/api/me/enrollments', {
    preHandler: [app.requireAuth, app.requireRoles(LEARNER_ROLES)],
  }, async (request) => {
    const result = await pool.query<{
      enrollment_id: string;
      course_id: string;
      course_slug: string;
      course_title: string;
      progress_percent: string;
      access_type: string;
      access_ends_at: string | null;
      last_activity_at: string | null;
      total_lessons: string;
      completed_lessons: string;
    }>(
      `
        SELECT
          e.id AS enrollment_id,
          c.id AS course_id,
          c.slug AS course_slug,
          c.title AS course_title,
          e.progress_percent::text AS progress_percent,
          e.access_type::text AS access_type,
          e.access_ends_at,
          e.last_activity_at,
          COUNT(DISTINCT l.id)::text AS total_lessons,
          COUNT(DISTINCT CASE WHEN p.is_completed THEN p.lesson_id END)::text AS completed_lessons
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        LEFT JOIN course_modules cm ON cm.course_id = c.id AND cm.deleted_at IS NULL
        LEFT JOIN lessons l ON l.module_id = cm.id AND l.deleted_at IS NULL
        LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = e.user_id
        WHERE e.user_id = $1
          AND e.status IN ('active', 'completed')
          AND c.deleted_at IS NULL
        GROUP BY e.id, c.id
        ORDER BY e.last_activity_at DESC NULLS LAST, e.created_at DESC
      `,
      [request.auth!.userId],
    );

    return {
      items: result.rows.map((row) => ({
        enrollmentId: row.enrollment_id,
        courseId: row.course_id,
        slug: row.course_slug,
        title: normalizeSeededCourseTitle(row.course_slug, row.course_title),
        progressPercent: Number(row.progress_percent),
        accessType: row.access_type,
        expiresAt: row.access_ends_at,
        lastActivityAt: row.last_activity_at,
        totalLessons: Number(row.total_lessons),
        completedLessons: Number(row.completed_lessons),
      })),
    };
  });
}
