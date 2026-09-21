import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { TopicFormDialog } from '@/components/teacher/topic-form-dialog';
import { PublishedWorkList, type PublishedWork } from '@/components/teacher/published-work-list';
import { EmptyState, Panel } from '@/components/dashboard';

export default async function TeacherAssignmentsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [classrooms, assignments] = await Promise.all([
    db.from('classrooms').select('id,name,subject').eq('tenant_id', context.tenantId).order('name'),
    db.from('assignments')
      .select('id,lesson_id,classroom_id,student_id,status,due_at,question_ids,lessons(title),classrooms(name),users!assignments_student_id_fkey(display_name)')
      .eq('tenant_id', context.tenantId).in('status', ['published', 'completed'])
      .order('created_at', { ascending: false }).limit(50),
  ]);
  const enrollments = await db.from('enrollments')
    .select('classroom_id,users!enrollments_user_id_fkey(id,display_name)')
    .eq('tenant_id', context.tenantId).eq('role', 'student').eq('active', true);
  for (const result of [classrooms, assignments, enrollments]) if (result.error) throw new Error(result.error.message);

  const students = (enrollments.data ?? []).flatMap(row =>
    row.users ? [{ id: row.users.id, name: row.users.display_name, classroomId: row.classroom_id }] : []);

  // 編集ダイアログはお題の本文・難易度・参考内容まで必要なので、
  // 一覧に出す assignment がぶら下げている question を一括で引く。
  const questionIds = [...new Set((assignments.data ?? []).flatMap(row => row.question_ids))];
  const questions = questionIds.length
    ? await db.from('questions').select('id,body,difficulty,concepts(description)')
        .eq('tenant_id', context.tenantId).in('id', questionIds)
    : { data: [], error: null };
  if (questions.error) throw new Error(questions.error.message);
  const questionById = new Map((questions.data ?? []).map(row => [row.id, row]));

  const works: PublishedWork[] = (assignments.data ?? []).map(row => {
    const question = row.question_ids[0] ? questionById.get(row.question_ids[0]) : undefined;
    return {
      assignmentId: row.id,
      questionId: question?.id ?? null,
      title: row.lessons?.title ?? '概念説明ワーク',
      classroomName: row.classrooms?.name ?? 'クラス',
      targetName: row.users?.display_name ?? 'クラス全員',
      status: row.status,
      dueAt: row.due_at,
      body: question?.body ?? '',
      difficulty: question?.difficulty ?? 2,
      content: question?.concepts?.description ?? '',
    };
  });

  return <div>
    {/* PageTitle は title しか描画しないため、見出しとボタンはここで組む */}
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#17233d] sm:text-[36px]">説明ワーク</h1>
        <p className="mt-2 text-sm text-[#60708d]">授業で扱った概念を、生徒が初学者にも伝わるように説明するワークとして公開します。</p>
      </div>
      <TopicFormDialog classrooms={classrooms.data ?? []} students={students} />
    </header>
    <Panel title="公開済みの説明ワーク" description="行を選ぶとお題を編集できます。">
      {works.length ? <PublishedWorkList works={works} /> : <EmptyState>まだ説明ワークはありません。</EmptyState>}
    </Panel>
  </div>;
}
