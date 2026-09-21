import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, parseJson, routeError, ApiInputError } from '@/lib/api/http';
import { preCheck } from '@/lib/security/guard';
import { triggerWorkerTick } from '@/lib/jobs/queue';
const schema = z.object({ id: z.uuid(), classroomId: z.uuid(), title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(20000), dueAt: z.iso.datetime() });
export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher', 'admin');
    const input = await parseJson(request, schema);
    const result = await adminDb().rpc('queue_lesson_preparation', { p_tenant: context.tenantId, p_actor: context.userId, p_id: input.id, p_classroom: input.classroomId,
      p_title: preCheck(input.title).masked.text, p_content: preCheck(input.content).masked.text, p_due: input.dueAt });
    if (result.error) throw new ApiInputError(result.error.code === 'P0001' ? result.error.message : '授業記録を受け付けられませんでした');
    triggerWorkerTick();
    return json({ id: result.data }, { status: 202 });
  } catch (error) { return routeError(error); }
}
