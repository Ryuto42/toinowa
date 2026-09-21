import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { createHandoff } from '@/lib/handoffs/service';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError } from '@/lib/api/http';

const schema = z.object({
  studentId: z.uuid(),
  toUser: z.uuid(),
  reason: z.enum(['class_change', 'substitute', 'promotion', 'consult', 'other']).default('other'),
  note: z.string().trim().min(1, '申し送りを入力してください').max(4_000),
});

export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher', 'admin');
    const body = await parseJson(request, schema);
    const id = await createHandoff({ context, ...body });
    recordAudit({
      tenantId: context.tenantId, actorId: context.userId, actorRole: context.role,
      action: 'handoff.create', resourceType: 'handoff', resourceId: id, result: 'allow',
      detail: { studentId: body.studentId, toUser: body.toUser, reason: body.reason },
    });
    return json({ id }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
