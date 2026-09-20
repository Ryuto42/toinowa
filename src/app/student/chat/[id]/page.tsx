import { redirect } from 'next/navigation';

export default async function StudentChatPage({ params }: PageProps<'/student/chat/[id]'>) {
  await params;
  // 旧URLからも、課題を起点にした概念説明ワークへ一本化する。
  redirect('/student/study');
}
