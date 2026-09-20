import { redirect } from 'next/navigation';

export default async function StudentConversationsPage({ params }: PageProps<'/teacher/students/[id]/conversations'>) {
  const { id } = await params;
  redirect(`/teacher/students/${id}`);
}
