import 'server-only';
import { cache } from 'react';
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
  password_revision: z.number().int().default(0),
});

/**
 * Supabaseの署名検証済みJWTクレームから認証コンテキストを作る。
 * getSession()のCookie値は直接信頼せず、getClaims()を使う。
 */
/** 1リクエスト内で何度呼んでも users への問い合わせは1回で済ませる。 */
const loadAuth = cache(async (allowPasswordChange: boolean): Promise<AuthContext> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new AuthRequiredError();

  const parsed = claimsSchema.safeParse(data.claims);
  if (!parsed.success || parsed.data.app_role === 'none') {
    throw new AuthRequiredError();
  }

  const user = await adminDb().from('users').select('status,must_change_password,password_revision').eq('id', parsed.data.sub).eq('tenant_id', parsed.data.tenant_id).single();
  if (user.error || user.data.status !== 'active') throw new AuthRequiredError();
  if ((user.data.must_change_password || user.data.password_revision !== parsed.data.password_revision) && !allowPasswordChange) throw new ForbiddenError('初期パスワードを変更してから利用してください');
  return {
    userId: parsed.data.sub,
    tenantId: parsed.data.tenant_id,
    role: parsed.data.app_role,
  };
});

export function requireAuth(options: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  return loadAuth(options.allowPasswordChange ?? false);
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
