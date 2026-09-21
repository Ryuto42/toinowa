import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { CreateWorkDialog } from '@/components/teacher/create-work-dialog';
import { PreparationRefresh, RetryPreparation } from '@/components/teacher/preparation-form';
import { PublishedWorkList, type PublishedWork } from '@/components/teacher/published-work-list';
import { EmptyState, PageTitle, Panel } from '@/components/dashboard';
import { jsonItems, jsonRecord } from '@/components/teacher/analysis';
import { formatDateTime } from '@/lib/shared/format';

export default async function TeacherAssignmentsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [classrooms, assignments, preparations, enrollments] = await Promise.all([
    db.from('classrooms').select('id,name,subject,individual_student_id').is('archived_at', null).eq('tenant_id', context.tenantId).order('name'),
    db.from('assignments').select('id,revision,source_plan_id,lesson_id,classroom_id,student_id,status,due_at,question_ids,lessons(title),classrooms(name),users!assignments_student_id_fkey(display_name)')
      .eq('tenant_id', context.tenantId).in('status', ['draft', 'published', 'completed']).order('created_at', { ascending: false }).limit(300),
    db.from('lesson_preparations').select('*').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(10),
    db.from('enrollments').select('classroom_id,users!enrollments_user_id_fkey(id,display_name,status,archived_at)').eq('tenant_id', context.tenantId).eq('role', 'student').eq('active', true),
  ]);
  for (const result of [classrooms, assignments, preparations, enrollments]) if (result.error) throw new Error(result.error.message);
  const students = (enrollments.data ?? []).flatMap(row => row.users && row.users.status==='active' && !row.users.archived_at && (classrooms.data ?? []).some(c=>c.id===row.classroom_id) ? [{ id: row.users.id, name: row.users.display_name, classroomId: row.classroom_id }] : []);
  const personalStudents = students.filter(s => (classrooms.data ?? []).some(c => c.id === s.classroomId && c.individual_student_id === s.id));
  const activeStudents = new Set(students.map(s=>s.id));
  const availableClasses = (classrooms.data ?? []).filter(c=>!c.individual_student_id || activeStudents.has(c.individual_student_id));
  const activeClasses = new Set(availableClasses.map(c=>c.id));
  const availablePreparations = (preparations.data ?? []).filter(p=>activeClasses.has(p.classroom_id));
  const availableAssignments = (assignments.data ?? []).filter(a => a.classroom_id && activeClasses.has(a.classroom_id) && (!a.student_id || activeStudents.has(a.student_id)));
  const questionIds = [...new Set((assignments.data ?? []).flatMap(row => row.question_ids))];
  const planIds = [...new Set((assignments.data ?? []).flatMap(row => row.source_plan_id ? [row.source_plan_id] : []))];
  const preparationIds = availablePreparations.map(row => row.id);
  // 内部ジョブは、RLSで読み取り許可を確認済みの授業記録IDだけに限定する。
  const [questions, plans, jobs, dead] = await Promise.all([
    questionIds.length ? db.from('questions').select('id,body,difficulty,concepts(description)').eq('tenant_id', context.tenantId).in('id', questionIds) : { data: [], error: null },
    planIds.length ? db.from('learning_plans').select('id,rationale,tasks,review_notes,preparation_id,source_assessment_id').eq('tenant_id', context.tenantId).in('id', planIds) : { data: [], error: null },
    preparationIds.length ? adminDb().from('jobs').select('status,payload,state').eq('tenant_id', context.tenantId).eq('kind','prepare_lesson_student').in('payload->>preparationId',preparationIds) : {data:[],error:null},
    preparationIds.length ? adminDb().from('jobs_dead').select('payload').eq('tenant_id', context.tenantId).eq('kind','prepare_lesson_student').in('payload->>preparationId',preparationIds) : {data:[],error:null},
  ]);
  for (const result of [questions,plans,jobs,dead]) if(result.error) throw new Error(result.error.message);
  const questionById = new Map((questions.data ?? []).map(row => [row.id, row]));
  const planById = new Map((plans.data ?? []).map(row => [row.id, row]));
  const works: PublishedWork[] = availableAssignments.map(row => {
    const question = row.question_ids[0] ? questionById.get(row.question_ids[0]) : undefined;
    const plan = row.source_plan_id ? planById.get(row.source_plan_id) : undefined;
    return { assignmentId:row.id,revision:row.revision,studentId:row.student_id, questionId:question?.id ?? null,
      title:row.lessons?.title ?? '説明課題', classroomName:row.classrooms?.name ?? 'クラス',targetName:row.users?.display_name ?? 'クラス全員',status:row.status,dueAt:row.due_at,
      body:question?.body ?? '',difficulty:question?.difficulty ?? 2,content:question?.concepts?.description ?? '', rationale:plan?.rationale,
      minutes:Number(jsonItems(plan?.tasks)[0]?.est_min) || undefined,
      reviewNotes:Array.isArray(plan?.review_notes) ? plan.review_notes.filter((note): note is string => typeof note === 'string') : [],
      sourceLabel:plan?.preparation_id ? '授業記録からの個別提案' : plan?.source_assessment_id ? '説明後の評価を踏まえた次回提案' : '登録情報・模試などからの提案',
    };
  });
  const drafts = works.filter(work => work.status === 'draft');
  const live = works.filter(work => work.status !== 'draft');
  const pending = (jobs.data ?? []).some(row => row.status === 'queued' || row.status === 'leased');
  return <div className="space-y-6">
    <PageTitle title="課題" description="授業記録を渡すと、AIが生徒別の課題と学習計画を準備します。"
      action={<CreateWorkDialog
        classrooms={(classrooms.data ?? []).filter(c=>!c.individual_student_id)}
        students={personalStudents}
      />} />
    {availablePreparations.length ? <Panel title="AIの準備状況" description="画面を閉じても、受け付けた授業記録から準備を続けます。">
      <div className="space-y-3">{availablePreparations.map(row => {
        const own = (jobs.data ?? []).filter(job => jsonRecord(job.payload).preparationId === row.id);
        const done = own.filter(job => job.status === 'succeeded' && !jsonRecord(job.state).cancelledByArchive).length;
        const cancelled = own.filter(job => jsonRecord(job.state).cancelledByArchive).length;
        const failed = (dead.data ?? []).filter(job => jsonRecord(job.payload).preparationId === row.id).length;
        return <div key={row.id} className="rounded-xl border border-slate-200 p-4"><p className="font-bold">{row.title}</p><p className="mt-1 text-sm text-slate-600">{formatDateTime(row.created_at)} · {done} / {row.student_ids.length}人の課題を準備済み{failed ? ` · ${failed}人分は準備できませんでした` : ''}{cancelled ? ` · ${cancelled}人分は利用停止により中止` : ''}</p>{failed ? <p className="mt-2 text-sm text-amber-800">用意できた課題は下に残っています。予算・AI稼働状況を確認してから、失敗分だけを再試行できます。</p> : null}{failed ? <RetryPreparation id={row.id} /> : null}</div>;
      })}</div><PreparationRefresh active={pending} />
    </Panel> : null}
    <div id="review"><Panel title={`先生の確認待ち（${drafts.length}件）`} description="生徒にはまだ表示されていません。お題と理由を確認して、配信する課題を選びます。">{drafts.length ? <PublishedWorkList works={drafts} /> : <EmptyState>授業記録を渡すと、ここに生徒別の課題案が届きます。</EmptyState>}</Panel></div>
    <Panel title="配信済みの課題" description="提出後は、生徒の説明の分析から次の課題案と学習計画を更新します。">{live.length ? <PublishedWorkList works={live} variant="table" /> : <EmptyState>承認して配信した課題がここに表示されます。</EmptyState>}</Panel>
  </div>;
}
