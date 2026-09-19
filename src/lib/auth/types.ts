import type { UserRole } from '@/lib/database/types';

export type AppRole = UserRole | 'none';

export interface AuthClaims {
  sub: string;
  tenant_id: string;
  app_role: AppRole;
  role?: string;
  exp?: number;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: AppRole;
  email?: string;
}

export type Role = Exclude<AppRole, 'none'>;
