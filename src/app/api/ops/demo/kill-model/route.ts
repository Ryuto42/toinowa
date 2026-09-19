import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError } from '@/lib/api/http';

const schema = z.object({
  model: z.string().trim().min(1).max(200),
  disabled: z.boolean().default(true),
  reason: z.string().trim().max(500).default('demo kill switch'),
});

export async function POST(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await parseJson(request, schema);
    const db = adminDb();
    if (body.disabled) {
      const result = await db.from('model_disables').upsert({ tenant_id: context.tenantId, model: body.model, reason: body.reason, disabled_by: context.userId, released_at: null }, { onConflict: 'tenant_id,model' }).select('*').single();
      if (result.error || !result.data) throw new Error(result.error?.message ?? 'model disable failed');
      recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role, action: 'model.disable', resourceType: 'model', result: 'allow', detail: { model: body.model } });
      return json({ disabled: true, model: result.data });
    }
    const result = await db.from('model_disables').update({ released_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('model', body.model).is('released_at', null).select('*').maybeSingle();
    if (result.error) throw new Error(result.error.message);
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role, action: 'model.enable', resourceType: 'model', result: 'allow', detail: { model: body.model } });
    return json({ disabled: false, model: result.data });
  } catch (error) {
    return routeError(error);
  }
}
