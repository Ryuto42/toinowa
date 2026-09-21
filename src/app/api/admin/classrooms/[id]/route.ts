import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { preCheck } from '@/lib/security/guard';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(40),
  grade: z.string().trim().max(40).default(''),
});

export async function PATCH(request: Request, route: Context) {
  try {
    const context = await requireRole('admin');
    const id = uuidParam((await route.params).id, 'classroomId');
    const body = await parseJson(request, schema);
    const { data, error } = await adminDb().from('classrooms').update({
      name: preCheck(body.name).masked.text,
      subject: preCheck(body.subject).masked.text,
      grade: body.grade ? preCheck(body.grade).masked.text : null,
    }).eq('tenant_id', context.tenantId).eq('id', id).select('id,name,subject,grade').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return json({ message: 'クラスが見つかりません' }, { status: 404 });
    recordAudit({
      tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin',
      action: 'classroom.update', resourceType: 'classroom', resourceId: id, result: 'allow',
    });
    return json({ classroom: data });
  } catch (error) {
    return routeError(error);
  }
}
