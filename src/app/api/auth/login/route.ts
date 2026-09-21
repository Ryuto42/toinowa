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

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_request' }, { status: 400 });
  const supabase = await createClient();
  const db = adminDb();
  const school = await supabase.from('school_codes').select('tenant_id').eq('code', parsed.data.organizationCode ?? parsed.data.schoolCode!).eq('active', true).maybeSingle();
  if (school.error || !school.data) return json({ error: 'invalid_credentials' }, { status: 401 });
  // 所属内の登録情報で解決する。Authユーザー全件の列挙やユーザー編集可能なメタデータに依存しない。
  const identifier = parsed.data.identifier.toLowerCase();
  const registered = await db.from('users').select('id,role,must_change_password').eq('tenant_id', school.data.tenant_id).eq('status', 'active')
    .eq(identifier.includes('@') ? 'email' : 'login_identifier', identifier).maybeSingle();
  if (registered.error || !registered.data) return json({ error: 'invalid_credentials' }, { status: 401 });
  const authUser = await db.auth.admin.getUserById(registered.data.id);
  if (authUser.error || !authUser.data.user.email) return json({ error: 'invalid_credentials' }, { status: 401 });
  const signedIn = await supabase.auth.signInWithPassword({ email: authUser.data.user.email, password: parsed.data.password });
  if (signedIn.error) return json({ error: 'invalid_credentials' }, { status: 401 });
  if (signedIn.data.user.id !== registered.data.id) {
    await supabase.auth.signOut();
    return json({ error: 'invalid_credentials' }, { status: 401 });
  }
  const mustChangePassword = registered.data.must_change_password;
  const role = registered.data.role;
  const redirectTo = mustChangePassword ? '/change-password' : role === 'student' ? '/student/home' : role === 'teacher' ? '/teacher/dashboard' : '/admin/overview';
  return json({ ok: true, redirectTo, mustChangePassword, role });
}
