import { UserRole } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  name: string;
  companyId: string;
  role: UserRole;
  iat?: number;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};
