import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { enqueueJob, triggerWorkerTick } from '@/lib/jobs/queue';
export async function applyExamAnalysis(tenantId: string, analysisId: string) {
  const db = adminDb();
  const applied = await db.rpc('apply_exam_analysis', { p_tenant: tenantId, p_analysis: analysisId });
  if (applied.error) throw new Error(applied.error.message);
  if (!applied.data) return;
  const analysis = await db.from('exam_analyses').select('created_by').eq('tenant_id', tenantId).eq('id', analysisId).single();
  if (analysis.error) throw new Error(analysis.error.message);
  const enrollments = await db.from('enrollments').select('classroom_id,classrooms(archived_at,individual_student_id)').eq('tenant_id', tenantId).eq('user_id', applied.data).eq('role','student').eq('active',true);
  if(enrollments.error) throw new Error(enrollments.error.message);
  const active = (enrollments.data ?? []).filter(row => !row.classrooms?.archived_at);
  const teachers = await db.from('enrollments').select('classroom_id').eq('tenant_id',tenantId).eq('role','teacher').eq('active',true);
  if(teachers.error) throw new Error(teachers.error.message);
  const contexts = active.filter(row => !row.classrooms?.individual_student_id || active.length===1 || (teachers.data ?? []).some(t=>t.classroom_id===row.classroom_id));
  for(const classroomId of new Set(contexts.map(row => row.classroom_id))) {
    const job = await enqueueJob({ tenantId, kind: 'build_learning_plan', idempotencyKey: `exam-plan:${analysisId}:${classroomId}`, payload: { studentId: applied.data, requestedBy: analysis.data.created_by, classroomId }, traceId: crypto.randomUUID() });
    if (!job) throw new Error('学習計画を予約できませんでした');
  }
  if (contexts.length) triggerWorkerTick();
}
