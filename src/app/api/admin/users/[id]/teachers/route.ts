import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, parseJson, routeError, uuidParam, ApiInputError } from '@/lib/api/http';
import { recordAudit } from '@/lib/security/audit';
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('admin');
    const id = uuidParam((await params).id);
    const body = await parseJson(request, z.object({ teacherIds: z.array(z.uuid()).max(30) }));
    const result = await adminDb().rpc('set_student_teachers', { p_tenant: context.tenantId, p_actor: context.userId, p_student: id, p_teachers: body.teacherIds });
    if (result.error) throw new ApiInputError(result.error.code === 'P0001' ? result.error.message : '担当を更新できませんでした');
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin', action: 'student.teachers', resourceType: 'student', resourceId: id, result: 'allow', detail: { count: body.teacherIds.length } });
    return json({ ok: true });
  } catch (error) { return routeError(error); }
}
