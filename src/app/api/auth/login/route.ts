import { z } from 'zod';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { json } from '@/lib/api/http';

const loginSchema = z.object({
  organizationCode: z.string().trim().min(1).max(32).optional(),
  schoolCode: z.string().trim().min(1).max(32).optional(),
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
}).refine(value => Boolean(value.organizationCode ?? value.schoolCode));

/** 総当たり対策の上限。ID単位は厳しく、IP単位は共有回線を考えて緩めにする。 */
const MAX_PER_IDENTIFIER = 8;
const MAX_PER_ADDRESS = 30;

function addressOf(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown').trim();
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_request' }, { status: 400 });
  const supabase = await createClient();
  const db = adminDb();
  const code = parsed.data.organizationCode ?? parsed.data.schoolCode!;

  // 失敗が続いている間は、認証情報を確かめる前に断る。
  const identifierKey = `id:${code.toLowerCase()}:${parsed.data.identifier.toLowerCase()}`;
  const addressKey = `ip:${addressOf(request)}`;
  const [byIdentifier, byAddress] = await Promise.all([
    db.rpc('login_attempt_count', { p_key: identifierKey }),
    db.rpc('login_attempt_count', { p_key: addressKey }),
  ]);
  if (Number(byIdentifier.data ?? 0) >= MAX_PER_IDENTIFIER || Number(byAddress.data ?? 0) >= MAX_PER_ADDRESS) {
    return json({ error: 'too_many_attempts', message: '試行が続いたため、しばらくログインできません。10分ほど待ってからお試しください。' }, { status: 429 });
  }
  const fail = async () => {
    await Promise.all([
      db.rpc('register_login_attempt', { p_key: identifierKey, p_success: false }),
      db.rpc('register_login_attempt', { p_key: addressKey, p_success: false }),
    ]);
    return json({ error: 'invalid_credentials' }, { status: 401 });
  };

  // 学校コードの突き合わせはサーバー側で行う（anon から school_codes は読めない）。
  const school = await db.from('school_codes').select('tenant_id').eq('code', code).eq('active', true).maybeSingle();
  if (school.error || !school.data) return fail();
  // 所属内の登録情報で解決する。Authユーザー全件の列挙やユーザー編集可能なメタデータに依存しない。
  const identifier = parsed.data.identifier.toLowerCase();
  const registered = await db.from('users').select('id,role,must_change_password').eq('tenant_id', school.data.tenant_id).eq('status', 'active')
    .eq(identifier.includes('@') ? 'email' : 'login_identifier', identifier).maybeSingle();
  if (registered.error || !registered.data) return fail();
  const authUser = await db.auth.admin.getUserById(registered.data.id);
  if (authUser.error || !authUser.data.user.email) return fail();
  const signedIn = await supabase.auth.signInWithPassword({ email: authUser.data.user.email, password: parsed.data.password });
  if (signedIn.error) return fail();
  if (signedIn.data.user.id !== registered.data.id) {
    await supabase.auth.signOut();
    return fail();
  }
  await Promise.all([
    db.rpc('register_login_attempt', { p_key: identifierKey, p_success: true }),
    db.rpc('register_login_attempt', { p_key: addressKey, p_success: true }),
  ]);
  const mustChangePassword = registered.data.must_change_password;
  const role = registered.data.role;
  const redirectTo = mustChangePassword ? '/change-password' : role === 'student' ? '/student/home' : role === 'teacher' ? '/teacher/dashboard' : '/admin/overview';
  return json({ ok: true, redirectTo, mustChangePassword, role });
}
