import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { StartChatButton } from '@/components/student/start-chat-button';
import { formatDate } from '@/lib/shared/format';

export default async function StudentHomePage() {
  const context = await requireRole('student');
  const db = await createClient();
  const [profile, tasks, reviews, notifications] = await Promise.all([
    db.from('student_profiles').select('*').eq('user_id', context.userId).maybeSingle(),
    db.from('assignments').select('*, lessons(title)').eq('tenant_id', context.tenantId).in('status', ['published', 'completed']).order('due_at', { ascending: true }).limit(8),
    db.from('review_schedules').select('*, concepts(name)').eq('student_id', context.userId).is('fulfilled_at', null).order('due_at').limit(5),
    db.from('notifications').select('*').eq('student_id', context.userId).is('read_at', null).order('created_at', { ascending: false }).limit(5),
  ]);
  const activeTasks = (tasks.data ?? []).filter((task) => task.status === 'published');
  return <div>
    <PageTitle eyebrow="Today" title="今日の学習" description="一番近い締切から、無理のない一歩を進めましょう。" action={<StartChatButton />} />
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="今日の目標" value={`${profile.data?.daily_time_limit_min ?? 30}分`} note="設定から変更できます"/><MetricCard label="取り組む課題" value={activeTasks.length} tone={activeTasks.length ? 'amber' : 'emerald'}/><MetricCard label="学習継続" value={`${profile.data?.streak_days ?? 0}日`} note="小さな積み重ねを記録します"/></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <Panel title="次に取り組むこと" description="期限と復習予定をまとめています">
        {activeTasks.length ? <div className="space-y-3">{activeTasks.map((task) => <Link key={task.id} href="/student/study" className="block rounded-xl border border-slate-200 p-4 hover:border-emerald-400"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{task.lessons?.title ?? '確認課題'}</p><p className="mt-1 text-xs text-slate-500">期限: {formatDate(task.due_at)} · {task.question_ids.length}問</p></div><StatusPill tone="amber">未完了</StatusPill></div></Link>)}</div> : <EmptyState>いま取り組む課題はありません。AIへの質問や復習記録を確認できます。</EmptyState>}
      </Panel>
      <div className="space-y-6"><Panel title="次回の復習">{reviews.data?.length ? <ul className="space-y-3 text-sm">{reviews.data.map((review) => <li key={review.id} className="flex justify-between gap-3"><span>{review.concepts?.name ?? '復習単元'}</span><span className="text-slate-500">{formatDate(review.due_at)}</span></li>)}</ul> : <EmptyState>復習予定はまだありません</EmptyState>}</Panel><Panel title="先生からのお知らせ">{notifications.data?.length ? <ul className="space-y-3">{notifications.data.map((item) => <li key={item.id}><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.body}</p></li>)}</ul> : <EmptyState>新しいお知らせはありません</EmptyState>}</Panel></div>
    </div>
  </div>;
}
