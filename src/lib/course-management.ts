import type { PoolClient } from 'pg';

import type { RequestAuth } from '../auth/request-auth';

export type CourseManagerContext = {
  isPrivileged: boolean;
  teacherId: string | null;
};

export async function resolveCourseManagerContext(client: PoolClient, auth: RequestAuth): Promise<CourseManagerContext> {
  const isPrivileged = auth.roles.includes('admin') || auth.roles.includes('manager');
  if (isPrivileged) {
    return {
      isPrivileged: true,
      teacherId: null,
    };
  }

  if (!auth.roles.includes('teacher')) {
    throw new Error('Teacher role is required');
  }

  const teacherResult = await client.query<{ id: string }>(
    `SELECT id FROM teachers WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [auth.userId],
  );

  if (teacherResult.rowCount !== 1) {
    throw new Error('Teacher profile is required');
  }

  return {
    isPrivileged: false,
    teacherId: teacherResult.rows[0].id,
  };
}

export async function assertCourseOwnership(client: PoolClient, auth: RequestAuth, courseId: string): Promise<{ courseId: string; teacherId: string }> {
  const result = await client.query<{ course_id: string; teacher_id: string; teacher_user_id: string }>(
    `
      SELECT c.id AS course_id, c.teacher_id, t.user_id AS teacher_user_id
      FROM courses c
      JOIN teachers t ON t.id = c.teacher_id
      WHERE c.id = $1
        AND c.deleted_at IS NULL
      LIMIT 1
    `,
    [courseId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Course not found');
  }

  const course = result.rows[0];
  const isPrivileged = auth.roles.includes('admin') || auth.roles.includes('manager');
  const ownsCourse = auth.roles.includes('teacher') && course.teacher_user_id === auth.userId;

  if (!isPrivileged && !ownsCourse) {
    throw new Error('Forbidden');
  }

  return {
    courseId: course.course_id,
    teacherId: course.teacher_id,
  };
}

export async function assertModuleOwnership(client: PoolClient, auth: RequestAuth, moduleId: string): Promise<{ moduleId: string; courseId: string }> {
  const result = await client.query<{ module_id: string; course_id: string }>(
    `
      SELECT cm.id AS module_id, cm.course_id
      FROM course_modules cm
      WHERE cm.id = $1
        AND cm.deleted_at IS NULL
      LIMIT 1
    `,
    [moduleId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Module not found');
  }

  await assertCourseOwnership(client, auth, result.rows[0].course_id);
  return {
    moduleId: result.rows[0].module_id,
    courseId: result.rows[0].course_id,
  };
}

export async function assertLessonOwnership(client: PoolClient, auth: RequestAuth, lessonId: string): Promise<{ lessonId: string; moduleId: string; courseId: string }> {
  const result = await client.query<{ lesson_id: string; module_id: string; course_id: string }>(
    `
      SELECT l.id AS lesson_id, l.module_id, cm.course_id
      FROM lessons l
      JOIN course_modules cm ON cm.id = l.module_id
      WHERE l.id = $1
        AND l.deleted_at IS NULL
      LIMIT 1
    `,
    [lessonId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Lesson not found');
  }

  await assertCourseOwnership(client, auth, result.rows[0].course_id);
  return {
    lessonId: result.rows[0].lesson_id,
    moduleId: result.rows[0].module_id,
    courseId: result.rows[0].course_id,
  };
}

