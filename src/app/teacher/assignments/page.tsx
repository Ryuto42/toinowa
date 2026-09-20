import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { TopicForm } from '@/components/teacher/topic-form';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

export default async function TeacherAssignmentsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [classrooms, assignments] = await Promise.all([
    db.from('classrooms').select('id,name,subject').eq('tenant_id', context.tenantId).order('name'),
    db.from('assignments').select('id,lesson_id,classroom_id,status,due_at,question_ids,lessons(title),classrooms(name)').eq('tenant_id', context.tenantId).in('status', ['published', 'completed']).order('created_at', { ascending: false }).limit(50),
  ]);
  const enrollments = await db.from('enrollments').select('classroom_id,users!enrollments_user_id_fkey(id,display_name)').eq('tenant_id', context.tenantId).eq('role', 'student').eq('active', true);
  const students = (enrollments.data ?? []).flatMap(row => row.users ? [{ id: row.users.id, name: row.users.display_name, classroomId: row.classroom_id }] : []);
  for (const result of [classrooms, assignments, enrollments]) if (result.error) throw new Error(result.error.message);
  return <div>
    <PageTitle eyebrow="Teacher" title="説明ワークを登録" description="授業で扱った概念を、生徒が初学者にも伝わるように説明するワークとして公開します。" />
    <Panel title="お題の作成"><TopicForm classrooms={classrooms.data ?? []} students={students} /></Panel>
    <div className="mt-6"><Panel title="公開済みの説明ワーク" description="生徒が取り組める説明ワークだけを表示しています.">
      {assignments.data?.length ? <div className="divide-y divide-slate-100">{assignments.data.map((assignment) => <article key={assignment.id} className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{assignment.lessons?.title ?? '概念説明ワーク'}</p><p className="mt-1 text-sm text-slate-500">{assignment.classrooms?.name ?? 'クラス'} · {assignment.question_ids.length}テーマ · 期限 {formatDate(assignment.due_at)}</p></div><StatusPill tone={assignment.status === 'published' ? 'emerald' : 'amber'}>{assignment.status === 'published' ? '公開中' : assignment.status}</StatusPill></article>)}</div> : <EmptyState>まだ説明ワークはありません。</EmptyState>}
    </Panel></div>
  </div>;
}
