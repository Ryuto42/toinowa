import Link from 'next/link'; import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { StartChatButton } from '@/components/student/start-chat-button';
import { formatDate } from '@/lib/shared/format';

export default async function StudentStudyPage() {
  const context = await requireRole('student');
  const { data } = await (await createClient()).from('assignments').select('*, lessons(title)').eq('tenant_id', context.tenantId).in('status', ['published', 'completed']).order('due_at');
  return <div><PageTitle eyebrow="Tasks" title="課題" description="問題の正解だけでなく、考え方も学習記録になります。"/><Panel title="課題一覧">{data?.length ? <div className="divide-y divide-slate-100">{data.map((task) => <article key={task.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex items-center gap-2"><h2 className="font-bold">{task.lessons?.title ?? '確認課題'}</h2><StatusPill tone={task.status === 'completed' ? 'emerald' : 'amber'}>{task.status === 'completed' ? '完了' : '学習中'}</StatusPill></div><p className="mt-1 text-sm text-slate-500">{task.question_ids.length}問 · 期限 {formatDate(task.due_at)}</p></div><div className="flex gap-2"><Link href={`/student/study/${task.id}`} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">問題を開く</Link><StartChatButton lessonId={task.lesson_id}/></div></article>)}</div> : <EmptyState>配信された課題はありません</EmptyState>}</Panel></div>;
}
