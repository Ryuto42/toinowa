import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import type { Json } from '@/lib/database/types';
import { createClient } from '@/lib/database/server';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  status: z.enum(['resolved', 'dismissed']).default('resolved'),
  note: z.string().trim().max(2_000).default(''),
  /** 生成AIの疑いに対する先生の判断。not_ai は「AIではない」と確定させる。 */
  verdict: z.enum(['not_ai', 'confirmed_ai']).optional(),
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

    // 先生の判断を回答そのものにも残す。次に同じ回答を見たとき、誰かがもう判断済みだと分かる。
    const payload = updated.data.payload as { answerId?: unknown } | null;
    const answerId = payload && typeof payload === 'object' && typeof payload.answerId === 'string' ? payload.answerId : null;
    if (body.verdict && answerId) {
      const answer = await adminDb().from('answers').select('ai_signals')
        .eq('tenant_id', context.tenantId).eq('id', answerId).maybeSingle();
      const signals = answer.data?.ai_signals && typeof answer.data.ai_signals === 'object' && !Array.isArray(answer.data.ai_signals)
        ? answer.data.ai_signals as Record<string, unknown> : {};
      await adminDb().from('answers').update({
        ...(body.verdict === 'not_ai' ? { ai_likelihood: 0 } : {}),
        ai_signals: {
          ...signals,
          teacherVerdict: body.verdict,
          teacherVerdictBy: context.userId,
          teacherVerdictAt: new Date().toISOString(),
        } as unknown as Json,
      }).eq('tenant_id', context.tenantId).eq('id', answerId);
    }

    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role, action: 'escalation.resolve', resourceType: 'escalation', resourceId: escalationId, result: 'allow', detail: { status: body.status, verdict: body.verdict ?? null } });
    return json({ escalation: updated.data });
  } catch (error) {
    return routeError(error);
  }
}
