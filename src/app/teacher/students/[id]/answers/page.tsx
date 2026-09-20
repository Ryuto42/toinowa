import { redirect } from 'next/navigation';

export default async function StudentAnswersPage({ params }: PageProps<'/teacher/students/[id]/answers'>) {
  const { id } = await params;
  redirect(`/teacher/students/${id}`);
}
