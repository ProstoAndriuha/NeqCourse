import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/pool';
import { normalizeSeededCourseDetail, normalizeSeededCourseTitle } from '../lib/seeded-course-fallbacks';

const listQuerySchema = z.object({
  category: z.string().optional(),
  level: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(12),
});

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/catalog/courses', async (request) => {
    const query = listQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;
    const values: unknown[] = [];
    const conditions = ["c.status = 'published'", 'c.deleted_at IS NULL'];

    if (query.category) {
      values.push(query.category);
      conditions.push(`cat.slug = $${values.length}`);
    }

    if (query.level) {
      values.push(query.level);
      conditions.push(`c.level::text = $${values.length}`);
    }

    if (query.search) {
      values.push(`%${query.search}%`);
      conditions.push(`(c.title ILIKE $${values.length} OR COALESCE(c.short_description, '') ILIKE $${values.length})`);
    }

    values.push(query.limit, offset);
    const limitParam = `$${values.length - 1}`;
    const offsetParam = `$${values.length}`;

    const sql = `
      WITH filtered_courses AS (
        SELECT DISTINCT
          c.id,
          c.slug,
          c.title,
          c.price_amount,
          c.currency,
          c.published_at,
          c.created_at,
          t.id AS teacher_id,
          t.display_name
        FROM courses c
        JOIN teachers t ON t.id = c.teacher_id
        LEFT JOIN course_categories cc ON cc.course_id = c.id
        LEFT JOIN categories cat ON cat.id = cc.category_id
        WHERE ${conditions.join(' AND ')}
      )
      SELECT
        fc.id,
        fc.slug,
        fc.title,
        fc.price_amount,
        fc.currency,
        fc.teacher_id,
        fc.display_name,
        COUNT(*) OVER() AS total_count
      FROM filtered_courses fc
      ORDER BY fc.published_at DESC NULLS LAST, fc.created_at DESC
      LIMIT ${limitParam}
      OFFSET ${offsetParam}
    `;

    const result = await pool.query(sql, values);
    const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: normalizeSeededCourseTitle(row.slug, row.title),
        priceAmount: Number(row.price_amount),
        currency: row.currency,
        teacher: {
          id: row.teacher_id,
          displayName: row.display_name,
        },
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  });

  app.get('/api/catalog/courses/:slug', async (request, reply) => {
    const params = z.object({ slug: z.string().min(1) }).parse(request.params);

    const courseResult = await pool.query(
      `
        SELECT
          c.id,
          c.slug,
          c.title,
          c.description,
          c.short_description,
          c.price_amount,
          c.currency,
          t.id AS teacher_id,
          t.display_name
        FROM courses c
        JOIN teachers t ON t.id = c.teacher_id
        WHERE c.slug = $1
          AND c.status = 'published'
          AND c.deleted_at IS NULL
      `,
      [params.slug],
    );

    if (courseResult.rowCount !== 1) {
      return reply.notFound('Course not found');
    }

    const modulesResult = await pool.query(
      `
        SELECT
          cm.id AS module_id,
          cm.title AS module_title,
          cm.sort_order AS module_sort_order,
          l.id AS lesson_id,
          l.title AS lesson_title,
          l.slug AS lesson_slug,
          l.sort_order AS lesson_sort_order,
          l.is_preview
        FROM course_modules cm
        LEFT JOIN lessons l ON l.module_id = cm.id AND l.deleted_at IS NULL AND l.status = 'published'
        WHERE cm.course_id = $1
          AND cm.deleted_at IS NULL
        ORDER BY cm.sort_order ASC, l.sort_order ASC
      `,
      [courseResult.rows[0].id],
    );

    const modules = new Map<string, {
      id: string;
      title: string;
      sortOrder: number;
      lessons: Array<{
        id: string;
        title: string;
        slug: string;
        isPreview: boolean;
      }>;
    }>();

    for (const row of modulesResult.rows) {
      if (!modules.has(row.module_id)) {
        modules.set(row.module_id, {
          id: row.module_id,
          title: row.module_title,
          sortOrder: Number(row.module_sort_order),
          lessons: [],
        });
      }

      if (row.lesson_id) {
        modules.get(row.module_id)?.lessons.push({
          id: row.lesson_id,
          title: row.lesson_title,
          slug: row.lesson_slug,
          isPreview: row.is_preview,
        });
      }
    }

    const normalizedCourse = normalizeSeededCourseDetail({
      id: courseResult.rows[0].id,
      slug: courseResult.rows[0].slug,
      title: courseResult.rows[0].title,
      description: courseResult.rows[0].description,
      shortDescription: courseResult.rows[0].short_description,
      priceAmount: Number(courseResult.rows[0].price_amount),
      currency: courseResult.rows[0].currency,
      teacher: {
        id: courseResult.rows[0].teacher_id,
        displayName: courseResult.rows[0].display_name,
      },
      modules: Array.from(modules.values()),
    });

    return {
      ...normalizedCourse,
      modules: normalizedCourse.modules.map(({ sortOrder: _sortOrder, ...module }) => module),
    };
  });
}
