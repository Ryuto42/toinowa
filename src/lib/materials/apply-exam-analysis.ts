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
  const job = await enqueueJob({ tenantId, kind: 'build_learning_plan', idempotencyKey: `exam-plan:${analysisId}`, payload: { studentId: applied.data, requestedBy: analysis.data.created_by }, traceId: crypto.randomUUID() });
  if (!job) throw new Error('学習計画を予約できませんでした');
  triggerWorkerTick();
}
