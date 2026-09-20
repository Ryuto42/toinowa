import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { assertApprovalScope } from '@/lib/approvals/scope';
import { queuePlanFromAssessment } from '@/lib/plans/followup';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('teacher', 'admin');
    const id = uuidParam((await route.params).id);
    const body = await parseJson(request, z.object({ decision: z.enum(['approved', 'rejected']), rejectReason: z.string().max(2000).optional(), dueAt: z.iso.datetime().optional() }));
    const db = adminDb();
    const current = await db.from('approvals').select('resource_type,resource_id').eq('tenant_id', context.tenantId).eq('id', id).single();
    if (current.error) throw new Error(current.error.message);
    if (current.data.resource_type === 'assignment' && body.decision === 'approved' && (!body.dueAt || new Date(body.dueAt).getTime() <= Date.now())) return json({ message: '今より後の期限を設定してください' }, { status: 400 });
    await assertApprovalScope(context, current.data.resource_type, current.data.resource_id);
    const result = await db.rpc('decide_learning_approval', { p_tenant: context.tenantId, p_actor: context.userId, p_approval: id, p_decision: body.decision, p_reason: body.rejectReason ?? '', ...(body.dueAt ? { p_due_at: body.dueAt } : {}) });
    if (result.error) throw new Error(result.error.message);
    if (current.data.resource_type === 'assessment' && body.decision === 'approved') await queuePlanFromAssessment(context.tenantId, current.data.resource_id);
    return json({ approval: result.data });
  } catch (error) { return routeError(error); }
}
