import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { REVIEWER_ROLES } from '../auth/roles';
import { pool } from '../db/pool';

const reviewSchema = z.object({
  courseId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(160),
  body: z.string().min(1),
});

export async function registerReviewRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/reviews', {
    preHandler: [
      app.requireAuth,
      app.requireRoles(REVIEWER_ROLES),
      app.rateLimit({
        name: 'reviews:create',
        max: 10,
        windowMs: 10 * 60 * 1000,
        keyGenerator: (request) => request.auth?.userId ?? request.ip,
      }),
    ],
  }, async (request, reply) => {
    const payload = reviewSchema.parse(request.body);
    const userId = request.auth!.userId;

    const enrollment = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM enrollments
        WHERE user_id = $1
          AND course_id = $2
          AND status IN ('active', 'completed')
        LIMIT 1
      `,
      [userId, payload.courseId],
    );

    if (enrollment.rowCount !== 1) {
      return reply.forbidden('Review requires an active or completed enrollment');
    }

    const result = await pool.query<{
      id: string;
      course_id: string;
      rating: number;
      status: string;
    }>(
      `
        INSERT INTO reviews (user_id, course_id, enrollment_id, rating, title, body, status, is_verified_purchase)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending_moderation', TRUE)
        ON CONFLICT (user_id, course_id)
        DO UPDATE SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body, status = 'pending_moderation', updated_at = NOW()
        RETURNING id, course_id, rating, status::text AS status
      `,
      [userId, payload.courseId, enrollment.rows[0].id, payload.rating, payload.title, payload.body],
    );

    return reply.code(201).send({
      id: result.rows[0].id,
      courseId: result.rows[0].course_id,
      rating: result.rows[0].rating,
      status: result.rows[0].status,
    });
  });
}
