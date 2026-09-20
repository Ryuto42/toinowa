import { redirect } from 'next/navigation';

export default async function StudentPlanPage({ params }: PageProps<'/teacher/students/[id]/plan'>) {
  const { id } = await params;
  redirect(`/teacher/students/${id}`);
}
