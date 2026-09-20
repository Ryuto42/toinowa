import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { AssignmentForm } from '@/components/teacher/assignment-form';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

export default async function TeacherAssignmentsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [lessons, classrooms, concepts, questions, assignments] = await Promise.all([
    db.from('lessons').select('id,title,classroom_id').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }),
    db.from('classrooms').select('id,name,subject').eq('tenant_id', context.tenantId).order('name'),
    db.from('concepts').select('id,name,lesson_id').eq('tenant_id', context.tenantId).order('order_index'),
    db.from('questions').select('id,body,difficulty,concept_id').eq('tenant_id', context.tenantId).eq('format', 'explain').order('created_at'),
    db.from('assignments').select('id,lesson_id,classroom_id,status,due_at,question_ids,lessons(title),classrooms(name)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(50),
  ]);
  const conceptById = new Map((concepts.data ?? []).map((concept) => [concept.id, concept]));
  const formQuestions = (questions.data ?? []).flatMap((question) => {
    const concept = conceptById.get(question.concept_id);
    return concept ? [{ id: question.id, lessonId: concept.lesson_id, body: question.body, difficulty: question.difficulty, conceptName: concept.name }] : [];
  });
  return <div>
    <PageTitle eyebrow="Teacher" title="説明ワークを登録" description="授業で扱った概念を、生徒が初学者にも伝わるように説明するワークとして公開します。" />
    <Panel title="新しい概念説明ワーク">
      <p className="mb-5 text-sm leading-7 text-slate-600">授業で学んだ概念が何を意味するのか、なぜそうなるのかを自分の言葉で説明してもらいます。送信後はAIが説明の正確さと伝わりやすさを分析します。</p>
      <AssignmentForm lessons={lessons.data ?? []} classrooms={classrooms.data ?? []} questions={formQuestions} />
    </Panel>
    <div className="mt-6"><Panel title="公開済みの説明ワーク" description="生徒が取り組める説明ワークだけを表示しています.">
      {assignments.data?.length ? <div className="divide-y divide-slate-100">{assignments.data.map((assignment) => <article key={assignment.id} className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{assignment.lessons?.title ?? '概念説明ワーク'}</p><p className="mt-1 text-sm text-slate-500">{assignment.classrooms?.name ?? 'クラス'} · {assignment.question_ids.length}テーマ · 期限 {formatDate(assignment.due_at)}</p></div><StatusPill tone={assignment.status === 'published' ? 'emerald' : 'amber'}>{assignment.status === 'published' ? '公開中' : assignment.status}</StatusPill></article>)}</div> : <EmptyState>まだ説明ワークはありません。</EmptyState>}
    </Panel></div>
  </div>;
}
