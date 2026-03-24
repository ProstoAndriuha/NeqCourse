export type UserRole = 'student' | 'teacher' | 'admin' | 'moderator' | 'manager';

export const LEARNER_ROLES: UserRole[] = ['student', 'teacher', 'admin', 'manager'];
export const REVIEWER_ROLES: UserRole[] = ['student', 'teacher'];
export const COURSE_MANAGEMENT_ROLES: UserRole[] = ['teacher', 'admin', 'manager'];
export const MODERATION_ROLES: UserRole[] = ['admin', 'moderator', 'manager'];
export const ADMINISTRATION_ROLES: UserRole[] = ['admin', 'manager'];
