import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError } from '@/lib/api/http';

const createUserSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(8).max(256),
  role: z.enum(['student', 'teacher', 'admin']),
  loginIdentifier: z.string().trim().min(1).max(120).optional(),
});

export async function GET() {
  try {
    const context = await requireRole('admin');
    const { data, error } = await (await createClient()).from('users').select('id,role,display_name,email,login_identifier,status,created_at').eq('tenant_id', context.tenantId).order('role').order('display_name');
    if (error) throw new Error(error.message);
    return json({ users: data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  let authUserId: string | null = null;
  try {
    const context = await requireRole('admin');
    const body = await parseJson(request, createUserSchema);
    const db = adminDb();
    const { data: created, error: authError } = await db.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, user_metadata: { tenant_id: context.tenantId, login_identifier: body.loginIdentifier ?? null } });
    if (authError || !created.user) throw new Error(authError?.message ?? 'auth user create failed');
    authUserId = created.user.id;
    const { error: userError } = await db.from('users').insert({ id: authUserId, tenant_id: context.tenantId, role: body.role, display_name: body.displayName, email: body.email, login_identifier: body.loginIdentifier ?? null, status: 'active' });
    if (userError) throw new Error(userError.message);
    if (body.role === 'student') {
      const { error: profileError } = await db.from('student_profiles').insert({ user_id: authUserId, tenant_id: context.tenantId });
      if (profileError) throw new Error(profileError.message);
    }
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin', action: 'user.create', resourceType: 'user', resourceId: authUserId, result: 'allow', detail: { role: body.role } });
    return json({ user: { id: authUserId, role: body.role, displayName: body.displayName } }, { status: 201 });
  } catch (error) {
    if (authUserId) await adminDb().auth.admin.deleteUser(authUserId).catch(() => undefined);
    return routeError(error);
  }
}
