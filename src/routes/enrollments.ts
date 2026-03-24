import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { LEARNER_ROLES } from '../auth/roles';
import { pool } from '../db/pool';

const paramsSchema = z.object({
  courseId: z.uuid(),
});

export async function registerEnrollmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/enrollments/:courseId/access', {
    preHandler: [app.requireAuth, app.requireRoles(LEARNER_ROLES)],
  }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const userId = request.auth!.userId;

    const result = await pool.query<{
      access_type: string;
      access_ends_at: string | null;
    }>(
      `
        SELECT access_type::text AS access_type, access_ends_at
        FROM enrollments
        WHERE user_id = $1
          AND course_id = $2
          AND status = 'active'
          AND (access_ends_at IS NULL OR access_ends_at > NOW())
        ORDER BY granted_at DESC
        LIMIT 1
      `,
      [userId, params.courseId],
    );

    if (result.rowCount !== 1) {
      return reply.send({
        hasAccess: false,
        accessType: null,
        expiresAt: null,
      });
    }

    return {
      hasAccess: true,
      accessType: result.rows[0].access_type,
      expiresAt: result.rows[0].access_ends_at,
    };
  });
}
