import 'server-only';
import { registerJobHandler } from './registry';
import { adminDb } from '@/lib/database/admin';
import { curriculumAgent } from '@/lib/agents/catalog';
import { schedulePlan } from '@/lib/plans/schema';
import type { Json } from '@/lib/database/types';

registerJobHandler('build_learning_plan', async job => {
  const payload = job.payload as { studentId?: string; requestedBy?: string; assessmentId?: string; classroomId?: string };
  if (!payload?.studentId) throw new Error('studentId is required');
  const db = adminDb();
  const previous = await db.from('learning_plans').select('id,tasks,status,rationale').eq('tenant_id', job.tenant_id).eq('id', job.id).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  let plan = previous.data;
  if (!plan) {
    const profile = await db.from('student_profiles').select('*').eq('tenant_id', job.tenant_id).eq('user_id', payload.studentId).single();
    if (profile.error) throw new Error(profile.error.message);
    const value = profile.data;
    const assessments = await db.from('assessments').select('score,override_score,override_note,confidence,reviewer_status,difficulty_at_time,component_scores,misconceptions,difficulty_reason,concepts(name)')
      .eq('tenant_id', job.tenant_id).eq('student_id', payload.studentId).eq('is_final', true).order('created_at', { ascending: false }).limit(5);
    if (assessments.error) throw new Error(assessments.error.message);
    const recent = assessments.data ?? [];
    const current = recent[0]?.difficulty_at_time;
    // 長い模試と蓄積した評価でも入力上限を超えないよう、根拠を明示して要点を渡す。
    const recentEvidence = recent.map(item => ({
      concept: item.concepts?.name?.slice(0, 200), score: item.override_score ?? item.score,
      teacherNote: item.override_note?.slice(0, 600), confidence: item.confidence,
      reviewerStatus: item.reviewer_status, difficulty: item.difficulty_at_time,
      analysis: item.difficulty_reason?.slice(0, 900),
      misconceptions: JSON.stringify(item.misconceptions).slice(0, 600),
    }));

    const result = await curriculumAgent.run({ studentId: payload.studentId, availableMinutes: value.daily_time_limit_min,
      masterySummary: JSON.stringify({ grade: value.grade, goal: value.learning_goal?.slice(0, 1500), examResults: value.exam_results?.slice(0, 12000), weakAreas: value.weak_areas?.slice(0, 2000), recentAssessments: recentEvidence }) },
      { tenantId: job.tenant_id, traceId: job.trace_id, studentId: payload.studentId, userId: payload.requestedBy ?? null });
    if (result.meta.degraded || !result.data.tasks.length) throw new Error('学習計画を生成できませんでした。再試行します。');
    const needsReview = result.data.needsTeacherReview || recent.some(item => item.reviewer_status === 'pending_review');
    const tasks = result.data.tasks.map(task => ({ ...task, difficulty: current ? Math.max(1, Math.min(5, Math.max(current - 1, Math.min(current + 1, task.difficulty)))) : task.difficulty }));
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    const inserted = await db.from('learning_plans').upsert({ id: job.id, tenant_id: job.tenant_id, student_id: payload.studentId,
      period_start: start, period_end: end, tasks: schedulePlan(tasks, value.daily_time_limit_min, start) as Json,
      rationale: `${needsReview ? '【要確認】' : ''}${result.data.rationale}\n根拠: ${result.data.evidence.join(' / ')}`, status: 'pending_review', agent_run_id: result.meta.runId }, { onConflict: 'id', ignoreDuplicates: true });
    if (inserted.error) throw new Error(inserted.error.message);
    const saved = await db.from('learning_plans').select('id,tasks,status,rationale').eq('tenant_id', job.tenant_id).eq('id', job.id).single();
    if (saved.error) throw new Error(saved.error.message);
    plan = saved.data;
  }
  const enrollments = await db.from('enrollments').select('classroom_id').eq('tenant_id', job.tenant_id).eq('user_id', payload.studentId).eq('role', 'student').eq('active', true).order('id');
  if (enrollments.error) throw new Error(enrollments.error.message);
  const classroomId = payload.classroomId && enrollments.data?.some(row => row.classroom_id === payload.classroomId) ? payload.classroomId : enrollments.data?.length === 1 ? enrollments.data[0].classroom_id : null;
  if (!classroomId) throw new Error('生徒の担当クラスを設定してください');
  const teachers = await db.from('enrollments').select('user_id').eq('tenant_id', job.tenant_id).eq('classroom_id', classroomId).eq('role', 'teacher').eq('active', true).order('id').limit(1);
  if (teachers.error) throw new Error(teachers.error.message);
  const admins = teachers.data?.length ? null : await db.from('users').select('id').eq('tenant_id', job.tenant_id).eq('role', 'admin').eq('status', 'active').order('id').limit(1);
  if (admins?.error) throw new Error(admins.error.message);
  const actor = teachers.data?.[0]?.user_id ?? admins?.data?.[0]?.id;
  if (!actor) throw new Error('担当の先生または管理者が必要です');
  const tasks = plan.tasks as Array<{ concept: string; goal: string; prompt: string; difficulty: number }>;
  const first = tasks[0];
  if (!first) throw new Error('計画にお題がありません');
  const work = await db.rpc('create_explanation_work', { p_tenant: job.tenant_id, p_actor: actor, p_classroom: classroomId, p_student: payload.studentId,
    p_plan: plan.id, p_title: first.concept, p_body: first.prompt, p_content: first.goal, p_difficulty: first.difficulty, p_publish: false });
  if (work.error) throw new Error(work.error.message);
  return { nextStep: null, state: { planId: plan.id, assignmentId: work.data } };
});
