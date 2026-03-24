import type { PoolClient } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { COURSE_MANAGEMENT_ROLES } from '../auth/roles';
import { pool } from '../db/pool';
import { assertCourseOwnership, assertLessonOwnership, assertModuleOwnership, resolveCourseManagerContext } from '../lib/course-management';

const courseListQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
});

const courseSchema = z.object({
  teacherId: z.uuid().optional(),
  title: z.string().min(3).max(255),
  slug: z.string().min(3).max(255),
  shortDescription: z.string().max(500).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'review', 'published', 'archived']).default('draft'),
  visibility: z.enum(['public', 'private', 'unlisted']).default('public'),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'all_levels']).default('all_levels'),
  language: z.string().min(2).max(16).default('en'),
  priceAmount: z.number().nonnegative().default(0),
  compareAtAmount: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  thumbnailUrl: z.string().url().optional(),
  previewVideoUrl: z.string().url().optional(),
  durationMinutes: z.number().int().nonnegative().default(0),
  isSubscriptionIncluded: z.boolean().default(true),
  certificateEnabled: z.boolean().default(true),
  categoryIds: z.array(z.uuid()).default([]),
});

const moduleSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().optional(),
  sortOrder: z.number().int().positive(),
  isPublished: z.boolean().default(false),
});

const lessonSchema = z.object({
  title: z.string().min(2).max(255),
  slug: z.string().min(2).max(255),
  summary: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  lessonType: z.enum(['text', 'video', 'live', 'quiz', 'assignment', 'mixed']).default('video'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sortOrder: z.number().int().positive(),
  durationSeconds: z.number().int().nonnegative().default(0),
  isPreview: z.boolean().default(false),
  isMandatory: z.boolean().default(true),
});

const courseParamsSchema = z.object({
  courseId: z.uuid(),
});

const moduleParamsSchema = z.object({
  moduleId: z.uuid(),
});

const lessonParamsSchema = z.object({
  lessonId: z.uuid(),
});

async function replaceCourseCategories(client: PoolClient, courseId: string, categoryIds: string[]): Promise<void> {
  await client.query(`DELETE FROM course_categories WHERE course_id = $1`, [courseId]);

  for (const categoryId of categoryIds) {
    await client.query(
      `INSERT INTO course_categories (course_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [courseId, categoryId],
    );
  }
}

export async function registerTeacherCourseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/teacher/courses', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request) => {
    const query = courseListQuerySchema.parse(request.query);
    const auth = request.auth!;
    const client = await pool.connect();

    try {
      const context = await resolveCourseManagerContext(client, auth);
      const values: unknown[] = [];
      const conditions = ['c.deleted_at IS NULL'];

      if (!context.isPrivileged || query.scope === 'mine') {
        values.push(context.teacherId);
        conditions.push(`c.teacher_id = $${values.length}`);
      }

      const result = await client.query(
        `
          SELECT c.id, c.title, c.slug, c.status::text AS status, c.price_amount::text AS price_amount, c.created_at, t.display_name
          FROM courses c
          JOIN teachers t ON t.id = c.teacher_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY c.updated_at DESC
        `,
        values,
      );

      return {
        items: result.rows.map((row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          status: row.status,
          priceAmount: Number(row.price_amount),
          teacherDisplayName: row.display_name,
          createdAt: row.created_at,
        })),
      };
    } finally {
      client.release();
    }
  });

  app.post('/api/teacher/courses', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const payload = courseSchema.parse(request.body);
    const auth = request.auth!;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const context = await resolveCourseManagerContext(client, auth);

      let teacherId = context.teacherId;
      if (context.isPrivileged && payload.teacherId) {
        teacherId = payload.teacherId;
      }

      if (!teacherId) {
        throw app.httpErrors.badRequest('teacherId is required');
      }

      const insertResult = await client.query<{ id: string }>(
        `
          INSERT INTO courses (
            teacher_id,
            created_by_user_id,
            updated_by_user_id,
            title,
            slug,
            short_description,
            description,
            status,
            visibility,
            level,
            language,
            price_amount,
            compare_at_amount,
            currency,
            thumbnail_url,
            preview_video_url,
            duration_minutes,
            is_subscription_included,
            certificate_enabled,
            published_at
          ) VALUES (
            $1, $2, $2, $3, $4, $5, $6, $7::course_status_enum, $8, $9::course_level_enum, $10,
            $11, $12, $13, $14, $15, $16, $17, $18,
            CASE WHEN $7 = 'published' THEN NOW() ELSE NULL END
          ) RETURNING id
        `,
        [
          teacherId,
          auth.userId,
          payload.title,
          payload.slug,
          payload.shortDescription ?? null,
          payload.description ?? null,
          payload.status,
          payload.visibility,
          payload.level,
          payload.language,
          payload.priceAmount,
          payload.compareAtAmount ?? null,
          payload.currency,
          payload.thumbnailUrl ?? null,
          payload.previewVideoUrl ?? null,
          payload.durationMinutes,
          payload.isSubscriptionIncluded,
          payload.certificateEnabled,
        ],
      );

      await replaceCourseCategories(client, insertResult.rows[0].id, payload.categoryIds);
      await client.query('COMMIT');

      return reply.code(201).send({
        id: insertResult.rows[0].id,
        slug: payload.slug,
        title: payload.title,
        status: payload.status,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/api/teacher/courses/:courseId', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const client = await pool.connect();

    try {
      await assertCourseOwnership(client, request.auth!, params.courseId);
      const result = await client.query(
        `
          SELECT c.*, t.display_name
          FROM courses c
          JOIN teachers t ON t.id = c.teacher_id
          WHERE c.id = $1
            AND c.deleted_at IS NULL
        `,
        [params.courseId],
      );

      if (result.rowCount !== 1) {
        return reply.notFound('Course not found');
      }

      const categories = await client.query<{ category_id: string }>(
        `SELECT category_id FROM course_categories WHERE course_id = $1`,
        [params.courseId],
      );

      return {
        id: result.rows[0].id,
        title: result.rows[0].title,
        slug: result.rows[0].slug,
        shortDescription: result.rows[0].short_description,
        description: result.rows[0].description,
        status: result.rows[0].status,
        visibility: result.rows[0].visibility,
        level: result.rows[0].level,
        language: result.rows[0].language,
        priceAmount: Number(result.rows[0].price_amount),
        compareAtAmount: result.rows[0].compare_at_amount ? Number(result.rows[0].compare_at_amount) : null,
        currency: result.rows[0].currency,
        thumbnailUrl: result.rows[0].thumbnail_url,
        previewVideoUrl: result.rows[0].preview_video_url,
        durationMinutes: result.rows[0].duration_minutes,
        isSubscriptionIncluded: result.rows[0].is_subscription_included,
        certificateEnabled: result.rows[0].certificate_enabled,
        teacherDisplayName: result.rows[0].display_name,
        categoryIds: categories.rows.map((row) => row.category_id),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Forbidden') {
        return reply.forbidden('You do not own this course');
      }
      if (error instanceof Error && error.message === 'Course not found') {
        return reply.notFound('Course not found');
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.put('/api/teacher/courses/:courseId', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const payload = courseSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(request.body);
    const auth = request.auth!;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const ownership = await assertCourseOwnership(client, auth, params.courseId);

      if (payload.teacherId && !(auth.roles.includes('admin') || auth.roles.includes('manager'))) {
        throw app.httpErrors.forbidden('Only admin or manager can reassign courses');
      }

      const nextTeacherId = payload.teacherId ?? ownership.teacherId;
      await client.query(
        `
          UPDATE courses
          SET teacher_id = $2,
              updated_by_user_id = $3,
              title = COALESCE($4, title),
              slug = COALESCE($5, slug),
              short_description = COALESCE($6, short_description),
              description = COALESCE($7, description),
              status = COALESCE($8::course_status_enum, status),
              visibility = COALESCE($9, visibility),
              level = COALESCE($10::course_level_enum, level),
              language = COALESCE($11, language),
              price_amount = COALESCE($12, price_amount),
              compare_at_amount = COALESCE($13, compare_at_amount),
              currency = COALESCE($14, currency),
              thumbnail_url = COALESCE($15, thumbnail_url),
              preview_video_url = COALESCE($16, preview_video_url),
              duration_minutes = COALESCE($17, duration_minutes),
              is_subscription_included = COALESCE($18, is_subscription_included),
              certificate_enabled = COALESCE($19, certificate_enabled),
              published_at = CASE
                WHEN COALESCE($8::course_status_enum, status) = 'published' AND published_at IS NULL THEN NOW()
                ELSE published_at
              END
          WHERE id = $1
        `,
        [
          params.courseId,
          nextTeacherId,
          auth.userId,
          payload.title ?? null,
          payload.slug ?? null,
          payload.shortDescription ?? null,
          payload.description ?? null,
          payload.status ?? null,
          payload.visibility ?? null,
          payload.level ?? null,
          payload.language ?? null,
          payload.priceAmount ?? null,
          payload.compareAtAmount ?? null,
          payload.currency ?? null,
          payload.thumbnailUrl ?? null,
          payload.previewVideoUrl ?? null,
          payload.durationMinutes ?? null,
          payload.isSubscriptionIncluded ?? null,
          payload.certificateEnabled ?? null,
        ],
      );

      if (payload.categoryIds) {
        await replaceCourseCategories(client, params.courseId, payload.categoryIds);
      }

      await client.query('COMMIT');
      return reply.send({ updated: true, courseId: params.courseId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Forbidden') {
        return reply.forbidden('You do not own this course');
      }
      if (error instanceof Error && error.message === 'Course not found') {
        return reply.notFound('Course not found');
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete('/api/teacher/courses/:courseId', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await assertCourseOwnership(client, request.auth!, params.courseId);
      await client.query(
        `UPDATE courses SET deleted_at = NOW(), status = 'archived', archived_at = NOW(), updated_by_user_id = $2 WHERE id = $1`,
        [params.courseId, request.auth!.userId],
      );
      await client.query('COMMIT');
      return reply.send({ archived: true, courseId: params.courseId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Forbidden') {
        return reply.forbidden('You do not own this course');
      }
      if (error instanceof Error && error.message === 'Course not found') {
        return reply.notFound('Course not found');
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/teacher/courses/:courseId/modules', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const params = courseParamsSchema.parse(request.params);
    const payload = moduleSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await assertCourseOwnership(client, request.auth!, params.courseId);
      const insert = await client.query<{ id: string }>(
        `
          INSERT INTO course_modules (course_id, created_by_user_id, updated_by_user_id, title, description, sort_order, is_published)
          VALUES ($1, $2, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [params.courseId, request.auth!.userId, payload.title, payload.description ?? null, payload.sortOrder, payload.isPublished],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ id: insert.rows[0].id, courseId: params.courseId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Forbidden') {
        return reply.forbidden('You do not own this course');
      }
      if (error instanceof Error && error.message === 'Course not found') {
        return reply.notFound('Course not found');
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.put('/api/teacher/modules/:moduleId', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const params = moduleParamsSchema.parse(request.params);
    const payload = moduleSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await assertModuleOwnership(client, request.auth!, params.moduleId);
      await client.query(
        `
          UPDATE course_modules
          SET updated_by_user_id = $2,
              title = COALESCE($3, title),
              description = COALESCE($4, description),
              sort_order = COALESCE($5, sort_order),
              is_published = COALESCE($6, is_published)
          WHERE id = $1
        `,
        [params.moduleId, request.auth!.userId, payload.title ?? null, payload.description ?? null, payload.sortOrder ?? null, payload.isPublished ?? null],
      );
      await client.query('COMMIT');
      return reply.send({ updated: true, moduleId: params.moduleId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Forbidden') {
        return reply.forbidden('You do not own this module');
      }
      if (error instanceof Error && error.message === 'Module not found') {
        return reply.notFound('Module not found');
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/teacher/modules/:moduleId/lessons', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const params = moduleParamsSchema.parse(request.params);
    const payload = lessonSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await assertModuleOwnership(client, request.auth!, params.moduleId);
      const insert = await client.query<{ id: string }>(
        `
          INSERT INTO lessons (
            module_id,
            created_by_user_id,
            updated_by_user_id,
            title,
            slug,
            summary,
            body_markdown,
            lesson_type,
            status,
            sort_order,
            duration_seconds,
            is_preview,
            is_mandatory,
            published_at
          ) VALUES (
            $1, $2, $2, $3, $4, $5, $6, $7::lesson_type_enum, $8::lesson_status_enum,
            $9, $10, $11, $12,
            CASE WHEN $8 = 'published' THEN NOW() ELSE NULL END
          ) RETURNING id
        `,
        [
          params.moduleId,
          request.auth!.userId,
          payload.title,
          payload.slug,
          payload.summary ?? null,
          payload.bodyMarkdown ?? null,
          payload.lessonType,
          payload.status,
          payload.sortOrder,
          payload.durationSeconds,
          payload.isPreview,
          payload.isMandatory,
        ],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ id: insert.rows[0].id, moduleId: params.moduleId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Forbidden') {
        return reply.forbidden('You do not own this module');
      }
      if (error instanceof Error && error.message === 'Module not found') {
        return reply.notFound('Module not found');
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.put('/api/teacher/lessons/:lessonId', {
    preHandler: [app.requireAuth, app.requireRoles(COURSE_MANAGEMENT_ROLES)],
  }, async (request, reply) => {
    const params = lessonParamsSchema.parse(request.params);
    const payload = lessonSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await assertLessonOwnership(client, request.auth!, params.lessonId);
      await client.query(
        `
          UPDATE lessons
          SET updated_by_user_id = $2,
              title = COALESCE($3, title),
              slug = COALESCE($4, slug),
              summary = COALESCE($5, summary),
              body_markdown = COALESCE($6, body_markdown),
              lesson_type = COALESCE($7::lesson_type_enum, lesson_type),
              status = COALESCE($8::lesson_status_enum, status),
              sort_order = COALESCE($9, sort_order),
              duration_seconds = COALESCE($10, duration_seconds),
              is_preview = COALESCE($11, is_preview),
              is_mandatory = COALESCE($12, is_mandatory),
              published_at = CASE
                WHEN COALESCE($8::lesson_status_enum, status) = 'published' AND published_at IS NULL THEN NOW()
                ELSE published_at
              END
          WHERE id = $1
        `,
        [
          params.lessonId,
          request.auth!.userId,
          payload.title ?? null,
          payload.slug ?? null,
          payload.summary ?? null,
          payload.bodyMarkdown ?? null,
          payload.lessonType ?? null,
          payload.status ?? null,
          payload.sortOrder ?? null,
          payload.durationSeconds ?? null,
          payload.isPreview ?? null,
          payload.isMandatory ?? null,
        ],
      );
      await client.query('COMMIT');
      return reply.send({ updated: true, lessonId: params.lessonId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && error.message === 'Forbidden') {
        return reply.forbidden('You do not own this lesson');
      }
      if (error instanceof Error && error.message === 'Lesson not found') {
        return reply.notFound('Lesson not found');
      }
      throw error;
    } finally {
      client.release();
    }
  });
}

