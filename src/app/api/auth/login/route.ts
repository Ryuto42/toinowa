import { z } from 'zod';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { resolveStudentEmail } from '@/lib/shared/env.server';
import { roleFromClaims } from '@/lib/auth/claims';

const loginSchema = z.object({
  schoolCode: z.string().trim().min(1).max(32),
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: school, error: schoolError } = await supabase
    .from('school_codes')
    .select('tenant_id')
    .eq('code', parsed.data.schoolCode)
    .eq('active', true)
    .maybeSingle();
  if (schoolError || !school) {
    return Response.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  let email = parsed.data.identifier;
  if (!parsed.data.identifier.includes('@')) {
    // ログイン前は users のRLSを通せないため、Auth管理APIのメタデータだけで
    // 学校内のログインIDを解決する。見つからない場合は生徒用の規約メールへ戻す。
    const { data: authUsers } = await adminDb().auth.admin.listUsers({ page: 1, perPage: 1000 });
    const identifier = parsed.data.identifier.toLowerCase();
    const matched = authUsers?.users.find((user) => {
      const metadata = user.user_metadata as { tenant_id?: unknown; login_identifier?: unknown } | undefined;
      return metadata?.tenant_id === school.tenant_id &&
        typeof metadata.login_identifier === 'string' &&
        metadata.login_identifier.toLowerCase() === identifier;
    });
    email = matched?.email ?? resolveStudentEmail(parsed.data.schoolCode, parsed.data.identifier);
  }
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) return Response.json({ error: 'invalid_credentials' }, { status: 401 });

  const { data: claimsData } = await supabase.auth.getClaims();
  const role = roleFromClaims(claimsData?.claims?.app_role);
  const redirectTo = role === 'student'
    ? '/student/home'
    : role === 'teacher'
      ? '/teacher/dashboard'
      : role === 'admin'
        ? '/admin/overview'
        : '/';
  return Response.json({ ok: true, redirectTo });
}
