import 'server-only';
import { ApiInputError } from '@/lib/api/http';
import { registerJobHandler } from './registry';
import type { JobHandler } from './types';
import { adminDb } from '@/lib/database/admin';
import { curriculumAgent } from '@/lib/agents/catalog';
import { hasPlanningEvidence, schedulePlan } from '@/lib/plans/schema';
import { topicStudentContext } from '@/lib/materials/student-context';
import type { Json } from '@/lib/database/types';

const buildPlan: JobHandler = async job => {
  const payload = job.payload as { studentId?: string; requestedBy?: string; assessmentId?: string; classroomId?: string; preparationId?: string };
  if (!payload?.studentId) throw new ApiInputError('studentId is required');
  const db = adminDb();
  const enrollments = await db.from('enrollments').select('classroom_id,classrooms(name,subject,grade,archived_at)').eq('tenant_id', job.tenant_id).eq('user_id', payload.studentId).eq('role', 'student').eq('active', true).order('id');
  if (enrollments.error) throw new Error(enrollments.error.message);
  const classroomId = payload.classroomId ? (enrollments.data?.some(row => row.classroom_id === payload.classroomId) ? payload.classroomId : null) : enrollments.data?.length === 1 ? enrollments.data[0].classroom_id : null;
  if (!classroomId) throw new ApiInputError('生徒の担当クラスを設定してください');
  const classroom = enrollments.data?.find(row => row.classroom_id === classroomId)?.classrooms;
  if (classroom?.archived_at) throw new ApiInputError('このクラスはアーカイブされています');
  const preparation = payload.preparationId ? await db.from('lesson_preparations').select('*').eq('tenant_id', job.tenant_id).eq('id', payload.preparationId).eq('classroom_id', classroomId).single() : null;
  if (preparation?.error) throw new Error(preparation.error.message);
  if (preparation && !preparation.data?.student_ids.includes(payload.studentId)) throw new ApiInputError('準備対象の生徒ではありません');
  // 生成中に担当解除・利用停止された場合も、内部ジョブから処理を続けない。
  const teachers = await db.from('enrollments').select('user_id,users!enrollments_user_id_fkey!inner(status)').eq('tenant_id', job.tenant_id).eq('classroom_id', classroomId).eq('role', 'teacher').eq('active', true).eq('users.status', 'active').order('id').limit(1);
  if (teachers.error) throw new Error(teachers.error.message);
  const admins = teachers.data?.length ? null : await db.from('users').select('id').eq('tenant_id', job.tenant_id).eq('role', 'admin').eq('status', 'active').order('id').limit(1);
  if (admins?.error) throw new Error(admins.error.message);
  const actor = teachers.data?.[0]?.user_id ?? admins?.data?.[0]?.id;
  if (!actor) throw new ApiInputError('担当の先生または管理者が必要です');
  const student = await db.from('users').select('status').eq('tenant_id', job.tenant_id).eq('id', payload.studentId).single();
  if (student.error) throw new Error(student.error.message);
  if (student.data.status !== 'active') throw new ApiInputError('生徒の利用が停止されています');

  const assessmentSource = payload.assessmentId ? await db.from('assessments').select('id,concepts(description,lessons(title))').eq('tenant_id', job.tenant_id).eq('student_id', payload.studentId).eq('id', payload.assessmentId).single() : null;
  if (assessmentSource?.error) throw new Error(assessmentSource.error.message);
  const lessonContext = preparation?.data ? `${preparation.data.title}\n${preparation.data.content}` : assessmentSource?.data?.concepts ? `${assessmentSource.data.concepts.lessons?.title ?? ''}\n${assessmentSource.data.concepts.description ?? ''}` : '';

  const [profile, prior, history] = await Promise.all([
    db.from('student_profiles').select('*').eq('tenant_id', job.tenant_id).eq('user_id', payload.studentId).single(),
    db.from('learning_plans').select('id,tasks,rationale').eq('tenant_id', job.tenant_id).eq('student_id', payload.studentId).eq('classroom_id', classroomId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    topicStudentContext({ tenantId: job.tenant_id, userId: actor, role: 'teacher' }, payload.studentId, classroomId, db),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  if (prior.error) throw new Error(prior.error.message);
  const value = profile.data;

  // 登録後の再実行や、修正前に予約されたジョブもここで止める。
  // 既存の計画があっても、空の初期情報から自己紹介課題を再作成しない。
  if (!hasPlanningEvidence({
    learningGoal: value.learning_goal, examResults: value.exam_results,
    weakAreas: value.weak_areas, lessonContext, feedbackCount: history.feedbackUsed,
  })) {
    return { nextStep: null, state: { skipped: 'awaiting_learning_context' } };
  }

  const saved = await db.from('learning_plans').select('*').eq('tenant_id', job.tenant_id).eq('id', job.id).maybeSingle();
  if (saved.error) throw new Error(saved.error.message);
  let plan = saved.data;
  if (!plan) {
    const result = await curriculumAgent.run({ studentId: payload.studentId, availableMinutes: value.daily_time_limit_min ?? 30,
      masterySummary: history.text, lessonContext: `${classroom ? `対象クラス: ${classroom.name} / 科目: ${classroom.subject} / 学年: ${classroom.grade ?? value.grade}\n` : ''}${lessonContext}`.slice(0,21000),
      previousPlan: prior.data ? JSON.stringify(prior.data).slice(0, 10000) : '',
    }, { tenantId: job.tenant_id, traceId: job.trace_id, studentId: payload.studentId, userId: payload.requestedBy ?? null });
    if (result.meta.degraded || !result.data.tasks.length) throw new Error('学習計画を生成できませんでした。再試行します。');
    const current = history.latestDifficulty;
    const tasks = result.data.tasks.map(task => ({ ...task, difficulty: history.feedbackUsed && current ? Math.max(1, Math.min(5, Math.max(current - 1, Math.min(current + 1, task.difficulty)))) : task.difficulty }));
    // 画面・連続学習と同じ日本時間の暦日を使う。早朝に昨日の計画を作らない。
    const japanNow = Date.now() + 9 * 3600_000;
    const start = new Date(japanNow).toISOString().slice(0, 10);
    const end = new Date(japanNow + 6 * 86400000).toISOString().slice(0, 10);
    const notes = [
      ...(history.feedbackUsed ? [] : ['このクラスの完了済み評価がまだありません。初回の課題として範囲と難易度を確認してください。']),
      ...(result.data.needsTeacherReview ? ['情報の不足・矛盾があります。提案理由と授業範囲を確認してください。'] : []),
      ...(value.daily_time_limit_min == null ? ['学習時間は未設定のため、1日30分を上限とした仮の計画です。'] : []),
    ];
    const inserted = await db.from('learning_plans').upsert({ id: job.id, tenant_id: job.tenant_id, student_id: payload.studentId,
      classroom_id: classroomId, preparation_id: preparation?.data?.id ?? null, source_assessment_id: payload.assessmentId ?? null,
      supersedes_plan_id: prior.data?.id ?? null, review_notes: notes,
      period_start: start, period_end: end, tasks: schedulePlan(tasks, value.daily_time_limit_min ?? 30, start) as Json,
      rationale: `${result.data.rationale}\n根拠: ${result.data.evidence.join(' / ')}`, status: 'active', agent_run_id: result.meta.runId }, { onConflict: 'id', ignoreDuplicates: true });
    if (inserted.error) throw new Error(inserted.error.message);
    const loaded = await db.from('learning_plans').select('*').eq('tenant_id', job.tenant_id).eq('id', job.id).single();
    if (loaded.error) throw new Error(loaded.error.message);
    plan = loaded.data;
  }
  const tasks = plan.tasks as Array<{ concept: string; goal: string; prompt: string; difficulty: number }>;
  const first = tasks[0];
  if (!first) throw new Error('計画にお題がありません');
  const work = await db.rpc('create_explanation_work', { p_tenant: job.tenant_id, p_actor: actor, p_classroom: classroomId, p_student: payload.studentId,
    p_plan: plan.id, p_title: first.concept, p_body: first.prompt, p_content: lessonContext.slice(0,20000) || first.goal, p_difficulty: first.difficulty, p_publish: false,
    ...(preparation?.data?.due_at ? { p_due_at: preparation.data.due_at } : {}),
  });
  if (work.error) throw new Error(work.error.message);
  return { nextStep: null, state: { planId: plan.id, assignmentId: work.data } };
};
registerJobHandler('build_learning_plan', buildPlan);
registerJobHandler('prepare_lesson_student', buildPlan);
