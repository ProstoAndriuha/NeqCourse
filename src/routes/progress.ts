import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { LEARNER_ROLES } from '../auth/roles';
import { pool } from '../db/pool';

const lessonParamsSchema = z.object({
  lessonId: z.uuid(),
});

const courseParamsSchema = z.object({
  courseId: z.uuid(),
});

const bodySchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']),
  progressPercent: z.number().min(0).max(100),
  watchPercent: z.number().min(0).max(100).default(0),
  lastPositionSeconds: z.number().int().min(0).default(0),
  isCompleted: z.boolean().default(false),
});

export async function registerProgressRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/progress/courses/:courseId', {
    preHandler: [app.requireAuth, app.requireRoles(LEARNER_ROLES)],
  }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const userId = request.auth!.userId;

    const enrollment = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM enrollments
        WHERE user_id = $1
          AND course_id = $2
          AND status IN ('active', 'completed')
          AND (access_ends_at IS NULL OR access_ends_at > NOW())
        LIMIT 1
      `,
      [userId, params.courseId],
    );

    if (enrollment.rowCount !== 1) {
      return reply.forbidden('Active enrollment is required for progress access');
    }

    const result = await pool.query<{
      lesson_id: string;
      status: string | null;
      progress_percent: string | null;
      watch_percent: string | null;
      is_completed: boolean | null;
      last_position_seconds: number | null;
    }>(
      `
        SELECT
          l.id AS lesson_id,
          p.status::text AS status,
          p.progress_percent::text AS progress_percent,
          p.watch_percent::text AS watch_percent,
          p.is_completed,
          p.last_position_seconds
        FROM course_modules cm
        JOIN lessons l ON l.module_id = cm.id AND l.deleted_at IS NULL
        LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = $1
        WHERE cm.course_id = $2
          AND cm.deleted_at IS NULL
        ORDER BY cm.sort_order ASC, l.sort_order ASC
      `,
      [userId, params.courseId],
    );

    return {
      items: result.rows.map((row) => ({
        lessonId: row.lesson_id,
        status: row.status ?? 'not_started',
        progressPercent: Number(row.progress_percent ?? 0),
        watchPercent: Number(row.watch_percent ?? 0),
        isCompleted: row.is_completed ?? false,
        lastPositionSeconds: row.last_position_seconds ?? 0,
      })),
    };
  });

  app.put('/api/progress/lessons/:lessonId', {
    preHandler: [app.requireAuth, app.requireRoles(LEARNER_ROLES)],
  }, async (request, reply) => {
    const params = lessonParamsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    const userId = request.auth!.userId;

    const lessonResult = await pool.query<{
      lesson_id: string;
      course_id: string;
      enrollment_id: string | null;
    }>(
      `
        SELECT l.id AS lesson_id, cm.course_id, e.id AS enrollment_id
        FROM lessons l
        JOIN course_modules cm ON cm.id = l.module_id
        LEFT JOIN enrollments e ON e.course_id = cm.course_id AND e.user_id = $1 AND e.status = 'active'
        WHERE l.id = $2
          AND l.deleted_at IS NULL
      `,
      [userId, params.lessonId],
    );

    if (lessonResult.rowCount !== 1) {
      return reply.notFound('Lesson not found');
    }

    const lesson = lessonResult.rows[0];
    if (!lesson.enrollment_id) {
      return reply.forbidden('Active enrollment is required for progress updates');
    }

    const result = await pool.query<{
      lesson_id: string;
      status: string;
      progress_percent: string;
      watch_percent: string;
    }>(
      `
        INSERT INTO progress (
          user_id,
          course_id,
          lesson_id,
          enrollment_id,
          status,
          is_completed,
          progress_percent,
          watch_percent,
          last_position_seconds,
          started_at,
          completed_at,
          last_viewed_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::progress_status_enum,
          $6,
          $7,
          $8,
          $9,
          NOW(),
          CASE WHEN $6 THEN NOW() ELSE NULL END,
          NOW()
        )
        ON CONFLICT (user_id, lesson_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          is_completed = EXCLUDED.is_completed,
          progress_percent = EXCLUDED.progress_percent,
          watch_percent = EXCLUDED.watch_percent,
          last_position_seconds = EXCLUDED.last_position_seconds,
          completed_at = EXCLUDED.completed_at,
          last_viewed_at = EXCLUDED.last_viewed_at
        RETURNING lesson_id, status::text AS status, progress_percent::text, watch_percent::text
      `,
      [
        userId,
        lesson.course_id,
        params.lessonId,
        lesson.enrollment_id,
        body.status,
        body.isCompleted,
        body.progressPercent,
        body.watchPercent,
        body.lastPositionSeconds,
      ],
    );

    await pool.query(
      `
        UPDATE enrollments e
        SET progress_percent = COALESCE(progress_data.avg_progress, 0),
            last_activity_at = NOW(),
            status = CASE WHEN progress_data.all_completed THEN 'completed'::enrollment_status_enum ELSE e.status END,
            completed_at = CASE WHEN progress_data.all_completed THEN COALESCE(e.completed_at, NOW()) ELSE e.completed_at END
        FROM (
          SELECT
            p.enrollment_id,
            ROUND(AVG(p.progress_percent), 2) AS avg_progress,
            BOOL_AND(p.is_completed) AS all_completed
          FROM progress p
          WHERE p.enrollment_id = $1
          GROUP BY p.enrollment_id
        ) AS progress_data
        WHERE e.id = progress_data.enrollment_id
      `,
      [lesson.enrollment_id],
    );

    return {
      lessonId: result.rows[0].lesson_id,
      status: result.rows[0].status,
      progressPercent: Number(result.rows[0].progress_percent),
      watchPercent: Number(result.rows[0].watch_percent),
    };
  });
}
