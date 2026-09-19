import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle } from '@/components/dashboard';
import { ChatClient } from '@/components/student/chat-client';

export default async function StudentChatPage({ params }: PageProps<'/student/chat/[id]'>) {
  const context = await requireRole('student');
  const { id } = await params;
  const db = await createClient();
  const conversation = await db.from('conversations').select('*, lessons(title)').eq('tenant_id', context.tenantId).eq('id', id).eq('student_id', context.userId).maybeSingle();
  if (!conversation.data) notFound();
  const messages = await db.from('messages').select('id,actor,content_redacted,seq').eq('conversation_id', id).order('seq');
  return <div><PageTitle eyebrow="AI Chat" title={conversation.data.lessons?.title ?? '学習チャット'} description="答えを急がず、考え方を一緒に整理します。個人情報は入力前にマスクされます。"/><ChatClient conversationId={id} initialMessages={messages.data ?? []}/></div>;
}
