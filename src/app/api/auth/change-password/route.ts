import { z } from 'zod';
import { createClient as createAuthClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { requireAuth } from '@/lib/auth/guard';
import { newPasswordSchema } from '@/lib/auth/student-credentials';
import { clientEnv } from '@/lib/shared/env.client';
import { json, parseJson, routeError, ApiInputError } from '@/lib/api/http';

const schema = z.object({ currentPassword: z.string().min(1).max(256), password: newPasswordSchema }).refine(value => value.password !== value.currentPassword, '初期パスワードと異なるパスワードを設定してください');
export async function POST(request: Request) {
  try {
    const context = await requireAuth({ allowPasswordChange: true });
    const body = await parseJson(request, schema);
    const db = adminDb();
    const user = await db.auth.admin.getUserById(context.userId);
    if (user.error || !user.data.user.email) throw new Error('account not found');
    const verifier = createAuthClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const lock = await db.rpc('begin_password_change', { p_tenant: context.tenantId, p_user: context.userId });
    if (lock.error) throw new ApiInputError('パスワードを変更中です。少し待ってから再試行してください');
    try {
    const verified = await verifier.auth.signInWithPassword({ email: user.data.user.email, password: body.currentPassword });
    if (verified.error || verified.data.user.id !== context.userId) throw new ApiInputError('現在のパスワードが正しくありません');
    // 変更成功後のみ利用制限を解除する。更新失敗時は制限を残す。
    try {
      const updated = await verifier.auth.updateUser({ password: body.password });
      if (updated.error) throw new ApiInputError('パスワードを変更できませんでした。別のパスワードで再試行してください');
      const released = await db.from('users').update({ must_change_password: false }).eq('id', context.userId).eq('tenant_id', context.tenantId).eq('password_revision', lock.data).select('id');
      if (released.error || !released.data?.length) throw new Error('パスワードが再発行されました。最新の初期パスワードでやり直してください');
    } finally { await verifier.auth.signOut({ scope: 'local' }); }
    } finally {
      await db.from('users').update({ password_operation_until: null }).eq('id', context.userId).eq('tenant_id', context.tenantId).eq('password_revision', lock.data);
    }
    // パスワードを変えると元のセッションが無効になることがあり、リフレッシュだけでは
    // must_change_password を含んだ古いクレームが残る。残ったままだと proxy に
    // /change-password へ戻され、変更後もこの画面から抜けられない。
    // 新しいパスワードで貼り直して、制限が解けたクレームを確実に配る。
    const supabase = await createClient();
    const renewed = await supabase.auth.signInWithPassword({ email: user.data.user.email, password: body.password });
    if (renewed.error) {
      // 古いクレームを残さない。残すと /login も /change-password へ戻される。
      await supabase.auth.signOut().catch(() => {});
      return json({ ok: true, redirectTo: '/login?notice=password-changed' });
    }
    const home = context.role === 'student' ? '/student/home' : context.role === 'teacher' ? '/teacher/dashboard' : '/admin/overview';
    return json({ ok: true, redirectTo: `${home}?notice=password-changed` });
  } catch (error) { return routeError(error); }
}
