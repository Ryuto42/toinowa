import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { createClient } from '@/lib/database/server';
import { recordAudit } from '@/lib/security/audit';
import type { Json } from '@/lib/database/types';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  decision: z.enum(['approved', 'modified', 'rejected']),
  modifiedPayload: z.record(z.string(), z.unknown()).optional(),
  rejectReason: z.string().trim().max(2_000).optional(),
});

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const planId = uuidParam((await route.params).id, 'planId');
    const body = await parseJson(request, schema);
    const rlsDb = await createClient();
    const visible = await rlsDb.from('learning_plans').select('*').eq('tenant_id', context.tenantId)
      .eq('id', planId).maybeSingle();
    if (visible.error) throw new Error(visible.error.message);
    if (!visible.data) return json({ error: 'not_found' }, { status: 404 });
    const status = body.decision === 'approved' || body.decision === 'modified' ? 'approved' : 'superseded';
    const modifiedTasks = body.modifiedPayload?.tasks as unknown;
    const modifiedRationale = body.modifiedPayload?.rationale;
    const updated = await adminDb().from('learning_plans').update({
      status,
      approved_by: body.decision === 'rejected' ? null : context.userId,
      approved_at: body.decision === 'rejected' ? null : new Date().toISOString(),
      ...(body.decision === 'modified' && body.modifiedPayload ? {
        tasks: (modifiedTasks ?? visible.data.tasks) as Json,
        rationale: typeof modifiedRationale === 'string' ? modifiedRationale : visible.data.rationale,
      } : {}),
    }).eq('id', planId).eq('tenant_id', context.tenantId).select('*').single();
    if (updated.error || !updated.data) throw new Error(updated.error?.message ?? 'plan approval failed');
    await adminDb().from('approvals').insert({
      tenant_id: context.tenantId,
      resource_type: 'plan',
      resource_id: planId,
      requested_by: 'teacher',
      proposal: visible.data.tasks as Json,
      decision: body.decision,
      decided_by: context.userId,
      decided_at: new Date().toISOString(),
      modified_payload: (body.modifiedPayload ?? null) as unknown as Json,
      reject_reason: body.rejectReason ?? null,
    });
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role, action: 'plan.approve', resourceType: 'plan', resourceId: planId, result: 'allow', detail: { decision: body.decision } });
    return json({ plan: updated.data });
  } catch (error) {
    return routeError(error);
  }
}
