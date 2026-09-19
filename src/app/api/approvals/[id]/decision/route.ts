import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import type { Json } from '@/lib/database/types';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ decision: z.enum(['approved', 'modified', 'rejected']), rejectReason: z.string().trim().max(2_000).optional(), modifiedPayload: z.record(z.string(), z.unknown()).optional() });

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const id = uuidParam((await route.params).id, 'approvalId');
    const body = await parseJson(request, schema);
    const { data, error } = await adminDb().from('approvals').update({ decision: body.decision, decided_by: context.userId, decided_at: new Date().toISOString(), reject_reason: body.rejectReason ?? null, modified_payload: (body.modifiedPayload ?? null) as unknown as Json })
      .eq('id', id).eq('tenant_id', context.tenantId).is('decision', null).select('*').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return json({ error: 'not_found_or_already_decided' }, { status: 404 });
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role, action: 'approval.decide', resourceType: data.resource_type, resourceId: data.resource_id, result: 'allow', detail: { decision: body.decision } });
    return json({ approval: data });
  } catch (error) {
    return routeError(error);
  }
}
