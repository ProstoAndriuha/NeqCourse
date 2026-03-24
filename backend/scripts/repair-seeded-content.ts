import { Client } from 'pg';

import { env } from '../../src/config/env';

const courseSlug = 'postgresql-for-backend-developers';

async function main(): Promise<void> {
  const client = new Client({
    connectionString: env.DATABASE_URL,
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const courseResult = await client.query<{ id: string }>(
      `SELECT id FROM courses WHERE slug = $1 LIMIT 1`,
      [courseSlug],
    );

    if (courseResult.rowCount !== 1) {
      throw new Error(`Seeded course not found for slug "${courseSlug}"`);
    }

    const courseId = courseResult.rows[0].id;

    await client.query(
      `
        UPDATE teachers
        SET bio = $1
        WHERE display_name = 'Elena Popescu'
      `,
      ['Backend engineering instructor focused on API design and data architecture.'],
    );

    await client.query(
      `
        UPDATE categories
        SET description = CASE slug
          WHEN 'backend' THEN $1
          WHEN 'databases' THEN $2
          ELSE description
        END
        WHERE slug IN ('backend', 'databases')
      `,
      [
        'Server-side engineering, databases, and API design.',
        'PostgreSQL, data modeling, and query optimization.',
      ],
    );

    await client.query(
      `
        UPDATE courses
        SET
          title = $1,
          short_description = $2,
          description = $3
        WHERE id = $4
      `,
      [
        'PostgreSQL for Backend Developers',
        'Hands-on PostgreSQL course covering data modeling and production SQL.',
        'This course covers schema design, indexes, transactions, analytics queries, and database security.',
        courseId,
      ],
    );

    await client.query(
      `
        UPDATE course_modules
        SET
          title = CASE sort_order
            WHEN 1 THEN $1
            WHEN 2 THEN $2
            ELSE title
          END,
          description = CASE sort_order
            WHEN 1 THEN $3
            WHEN 2 THEN $4
            ELSE description
          END
        WHERE course_id = $5
      `,
      [
        'Module 1. Data Architecture',
        'Module 2. Performance',
        'Normalization, relationships, and table design.',
        'Indexes, EXPLAIN, and query tuning.',
        courseId,
      ],
    );

    await client.query(
      `
        UPDATE lessons
        SET
          title = CASE slug
            WHEN 'what-goes-to-postgres' THEN $1
            WHEN 'er-design-for-course-platform' THEN $2
            WHEN 'indexes-for-catalog-and-progress' THEN $3
            ELSE title
          END,
          summary = CASE slug
            WHEN 'what-goes-to-postgres' THEN $4
            WHEN 'er-design-for-course-platform' THEN $5
            WHEN 'indexes-for-catalog-and-progress' THEN $6
            ELSE summary
          END,
          body_markdown = CASE slug
            WHEN 'what-goes-to-postgres' THEN $7
            WHEN 'er-design-for-course-platform' THEN $8
            WHEN 'indexes-for-catalog-and-progress' THEN $9
            ELSE body_markdown
          END
        WHERE module_id IN (
          SELECT id
          FROM course_modules
          WHERE course_id = $10
        )
      `,
      [
        'What belongs in PostgreSQL and what belongs in object storage',
        'Designing an ER diagram for a course platform',
        'Indexes for catalog and progress',
        'Boundaries between metadata and files.',
        'Entities, relationships, and integrity constraints.',
        'How to choose the right indexes.',
        'We explain why videos and PDFs should live outside the database while metadata and links stay in PostgreSQL.',
        'We design users, courses, enrollments, payments, and progress step by step.',
        'We compare B-tree, partial, and composite indexes for real API queries.',
        courseId,
      ],
    );

    await client.query(
      `
        UPDATE lesson_resources
        SET title = CASE file_key
          WHEN 'courses/postgresql-backend/lesson-1/storage-guide.pdf' THEN $1
          WHEN 'mux://asset_postgres_er_001' THEN $2
          WHEN 'mux://asset_postgres_idx_001' THEN $3
          ELSE title
        END
        WHERE lesson_id IN (
          SELECT l.id
          FROM lessons l
          JOIN course_modules cm ON cm.id = l.module_id
          WHERE cm.course_id = $4
        )
      `,
      [
        'Storage reference diagram',
        'Lesson recording',
        'Lesson video',
        courseId,
      ],
    );

    await client.query(
      `
        UPDATE subscription_plans
        SET description = $1
        WHERE code = 'all-access-monthly'
      `,
      ['Subscription for the full course catalog with monthly billing.'],
    );

    await client.query(
      `
        UPDATE promocodes
        SET description = $1
        WHERE code = 'SPRING20'
      `,
      ['20% discount on selected courses.'],
    );

    await client.query(
      `
        UPDATE order_items
        SET title_snapshot = $1
        WHERE course_id = $2
      `,
      ['PostgreSQL for Backend Developers', courseId],
    );

    await client.query(
      `
        UPDATE reviews
        SET
          title = $1,
          body = $2
        WHERE course_id = $3
      `,
      [
        'Strong practical PostgreSQL course',
        'I liked that the schema and index choices are explained with production-style examples instead of toy tables.',
        courseId,
      ],
    );

    await client.query(
      `
        UPDATE notifications
        SET
          title = $1,
          body = $2
        WHERE payload ->> 'course_slug' = $3
      `,
      [
        'Course access is now active',
        'Payment has been confirmed. The course is already available in your dashboard.',
        courseSlug,
      ],
    );

    await client.query('COMMIT');
    console.log(`repaired seeded content for ${courseSlug}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

void main();
