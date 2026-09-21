import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { respondToHandoff } from '@/lib/handoffs/service';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  decision: z.enum(['accepted', 'declined', 'cancelled']),
  note: z.string().trim().max(2_000).default(''),
});

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const handoffId = uuidParam((await route.params).id, 'handoffId');
    const body = await parseJson(request, schema);
    const handoff = await respondToHandoff({ context, handoffId, ...body });
    recordAudit({
      tenantId: context.tenantId, actorId: context.userId, actorRole: context.role,
      action: 'handoff.respond', resourceType: 'handoff', resourceId: handoffId, result: 'allow',
      detail: { decision: body.decision },
    });
    return json({ handoff });
  } catch (error) {
    return routeError(error);
  }
}
