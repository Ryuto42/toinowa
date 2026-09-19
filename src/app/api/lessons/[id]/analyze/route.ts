import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { enqueueJob, triggerWorkerTick } from '@/lib/jobs/queue';
import { json, routeError, traceIdFrom, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const lessonId = uuidParam((await route.params).id);
    const db = await createClient();
    const lesson = await db.from('lessons').select('id').eq('tenant_id', context.tenantId)
      .eq('id', lessonId).maybeSingle();
    if (lesson.error) throw new Error(lesson.error.message);
    if (!lesson.data) return json({ error: 'not_found' }, { status: 404 });
    const job = await enqueueJob({
      tenantId: context.tenantId,
      kind: 'analyze_lesson',
      idempotencyKey: `analyze_lesson:${lessonId}`,
      payload: { lessonId },
      priority: 3,
      traceId: traceIdFrom(request),
    });
    triggerWorkerTick();
    return json({ accepted: true, job }, { status: 202 });
  } catch (error) {
    return routeError(error);
  }
}
