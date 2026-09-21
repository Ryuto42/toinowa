import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { generateInitialPassword } from '@/lib/auth/student-credentials';
import { recordAudit } from '@/lib/security/audit';
import { json, routeError, uuidParam, ApiInputError } from '@/lib/api/http';
export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('admin');
    const id = uuidParam((await route.params).id);
    const db = adminDb();
    const target = await db.from('users').select('id,email,login_identifier').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (target.error) throw new Error(target.error.message);
    if (!target.data) return json({ message: 'ユーザーが見つかりません' }, { status: 404 });
    const codes = await (await createClient()).from('school_codes').select('code').eq('tenant_id', context.tenantId).eq('active', true).order('code').limit(1);
    if (codes.error) throw new Error(codes.error.message);
    if (!codes.data?.length) throw new ApiInputError('有効な所属コードを設定してください');
    const locked = await db.rpc('begin_password_reset', { p_tenant: context.tenantId, p_actor: context.userId, p_user: id });
    if (locked.error) throw new ApiInputError('パスワードを変更中です。少し待ってから再試行してください');
    const password = generateInitialPassword();
    try {
      const changed = await db.auth.admin.updateUserById(id, { password });
      if (changed.error) throw new Error('初期パスワードを発行できませんでした。再試行してください');
    } finally {
      await db.from('users').update({ password_operation_until: null }).eq('tenant_id', context.tenantId).eq('id', id).eq('password_revision', locked.data);
    }
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin', action: 'user.reset_password', resourceType: 'user', resourceId: id, result: 'allow' });
    return json({ credentials: { organizationCode: codes.data[0].code, loginIdentifier: target.data.login_identifier ?? target.data.email, initialPassword: password }, self: id === context.userId });
  } catch (error) { return routeError(error); }
}
