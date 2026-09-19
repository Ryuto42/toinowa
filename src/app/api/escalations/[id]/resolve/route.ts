import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { createClient } from '@/lib/database/server';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  status: z.enum(['resolved', 'dismissed']).default('resolved'),
  note: z.string().trim().max(2_000).default(''),
});

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const escalationId = uuidParam((await route.params).id, 'escalationId');
    const body = await parseJson(request, schema);
    const visible = await (await createClient()).from('escalations').select('id')
      .eq('tenant_id', context.tenantId).eq('id', escalationId).maybeSingle();
    if (visible.error) throw new Error(visible.error.message);
    if (!visible.data) return json({ error: 'not_found' }, { status: 404 });
    const updated = await adminDb().from('escalations').update({
      status: body.status,
      resolved_by: context.userId,
      resolution_note: body.note,
      resolved_at: new Date().toISOString(),
    }).eq('tenant_id', context.tenantId).eq('id', escalationId).select('*').single();
    if (updated.error || !updated.data) throw new Error(updated.error?.message ?? 'escalation update failed');
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role, action: 'escalation.resolve', resourceType: 'escalation', resourceId: escalationId, result: 'allow', detail: { status: body.status } });
    return json({ escalation: updated.data });
  } catch (error) {
    return routeError(error);
  }
}
