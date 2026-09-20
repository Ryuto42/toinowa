import 'server-only';
import { z } from 'zod';
import { adminDb } from '@/lib/database/admin';
import { createClient } from '@/lib/database/server';
import { AuthRequiredError, ForbiddenError } from './errors';
import type { AuthContext, Role } from './types';

const claimsSchema = z.object({
  sub: z.uuid(),
  tenant_id: z.uuid(),
  app_role: z.enum(['student', 'teacher', 'admin', 'none']),
  exp: z.number().optional(),
});

/**
 * Supabaseの署名検証済みJWTクレームから認証コンテキストを作る。
 * getSession()のCookie値は直接信頼せず、getClaims()を使う。
 */
export async function requireAuth(options: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new AuthRequiredError();

  const parsed = claimsSchema.safeParse(data.claims);
  if (!parsed.success || parsed.data.app_role === 'none') {
    throw new AuthRequiredError();
  }

  const user = await adminDb().from('users').select('status,must_change_password').eq('id', parsed.data.sub).eq('tenant_id', parsed.data.tenant_id).single();
  if (user.error || user.data.status !== 'active') throw new AuthRequiredError();
  if (user.data.must_change_password && !options.allowPasswordChange) throw new ForbiddenError('初期パスワードを変更してから利用してください');
  return {
    userId: parsed.data.sub,
    tenantId: parsed.data.tenant_id,
    role: parsed.data.app_role,
  };
}

export async function requireRole<const R extends Role>(...allowed: R[]): Promise<AuthContext & { role: R }> {
  const context = await requireAuth();
  if (!allowed.includes(context.role as R)) throw new ForbiddenError();
  return context as AuthContext & { role: R };
}

export function assertTenant(context: AuthContext, tenantId: string): void {
  if (context.tenantId !== tenantId) throw new ForbiddenError('テナント境界を越える操作です');
}

export function assertSelfOrRole(
  context: AuthContext,
  subjectId: string,
  ...roles: Role[]
): void {
  if (context.userId === subjectId) return;
  if (roles.includes(context.role as Role)) return;
  throw new ForbiddenError('対象ユーザーを操作する権限がありません');
}

export type { AuthClaims, AuthContext, Role } from './types';
