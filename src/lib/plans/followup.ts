import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { enqueueJob, triggerWorkerTick } from '@/lib/jobs/queue';

export async function queuePlanFromAssessment(tenantId: string, assessmentId: string) {
  const db = adminDb();
  const result = await db.from('assessments').select('id,student_id,is_final,reviewer_status,reviewed_at,concepts(lessons(classroom_id))').eq('tenant_id', tenantId).eq('id', assessmentId).single();
  if (result.error) throw new Error(result.error.message);
  const row = result.data;
  if (!row.is_final || row.reviewer_status === 'rejected') return;
  const queued = await enqueueJob({ tenantId, kind: 'build_learning_plan',
    idempotencyKey: `assessment-plan:${row.id}:${row.reviewed_at ?? 'initial'}`,
    payload: { studentId: row.student_id, assessmentId: row.id, classroomId: row.concepts?.lessons?.classroom_id }, traceId: crypto.randomUUID() });
  if (!queued) throw new Error('次のお題の生成を予約できませんでした');
  triggerWorkerTick();
}
