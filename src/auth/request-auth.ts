import type { UserRole } from './roles';

export type RequestAuth = {
  userId: string;
  role: UserRole;
  roles: UserRole[];
  tokenVersion: number;
};
