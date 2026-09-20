import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle } from '@/components/dashboard';
import { ConceptChatLauncher } from '@/components/student/concept-chat';

export default async function StudyAssignmentPage({ params }: PageProps<'/student/study/[assignmentId]'>) {
  const context = await requireRole('student');
  const { assignmentId } = await params;
  const db = await createClient();
  const assignment = await db
    .from('assignments')
    .select('id,lesson_id,question_ids,lessons(title)')
    .eq('tenant_id', context.tenantId)
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment.data) notFound();

  const question = await db
    .from('questions')
    .select('id,concept_id,format')
    .eq('tenant_id', context.tenantId)
    .eq('id', assignment.data.question_ids[0] ?? '')
    .maybeSingle();
  if (!question.data || question.data.format !== 'explain') notFound();

  return <div>
    <PageTitle title={assignment.data.lessons?.title ?? '概念説明ワーク'} />
    <ConceptChatLauncher
      assignmentId={assignmentId}
      lessonId={assignment.data.lesson_id}
      conceptId={question.data.concept_id}
      questionId={question.data.id}
    />
  </div>;
}
