import Link from 'next/link';
import { TutorialEntry } from '@/components/student/tutorial-entry';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

export default async function StudentHomePage() {
  const context = await requireRole('student');
  const db = await createClient();
  const [profile, tasks, reviews, notifications, classrooms] = await Promise.all([
    db.from('student_profiles').select('*').eq('user_id', context.userId).maybeSingle(),
    db.from('assignments').select('*, lessons(title,classroom_id)').eq('tenant_id', context.tenantId).in('status', ['published', 'completed']).order('due_at', { ascending: true }).limit(8),
    db.from('review_schedules').select('*, concepts(name)').eq('student_id', context.userId).is('fulfilled_at', null).order('due_at').limit(5),
    db.from('notifications').select('*').eq('student_id', context.userId).is('read_at', null).order('created_at', { ascending: false }).limit(5),
    db.from('classrooms').select('id,subject').eq('tenant_id', context.tenantId),
  ]);
  // 生徒ごとの開封状態。行が無ければ未着手。
  const progress = await db.from('assignment_progress')
    .select('assignment_id,status').eq('student_id', context.userId);
  const progressByAssignment = new Map((progress.data ?? []).map((row) => [row.assignment_id, row.status]));
  const activeTasks = (tasks.data ?? [])
    .filter((task) => task.status === 'published')
    .filter((task) => progressByAssignment.get(task.id) !== 'completed');
  const subjectByClassroom = new Map((classrooms.data ?? []).map((classroom) => [classroom.id, classroom.subject]));
  return <div>
    <PageTitle title="今日の学習" />
    <TutorialEntry studentId={context.userId} tenantId={context.tenantId} />
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="今日の目標" value={`${profile.data?.daily_time_limit_min ?? 30}分`} note="設定から変更できます"/><MetricCard label="説明するテーマ" value={activeTasks.length} tone={activeTasks.length ? 'amber' : 'emerald'}/><MetricCard label="学習継続" value={`${profile.data?.streak_days ?? 0}日`} note="小さな積み重ねを記録します"/></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <Panel title="次に説明すること" description="期限と復習予定をまとめています">
        {activeTasks.length ? <div className="space-y-3">{activeTasks.map((task) => <Link key={task.id} href={`/student/study/${task.id}`} className="block rounded-xl border border-slate-200 p-4 hover:border-emerald-400"><div className="flex items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{task.lessons?.title ?? '概念説明ワーク'}</p>{task.lessons?.classroom_id && subjectByClassroom.get(task.lessons.classroom_id) ? <StatusPill tone="blue">{subjectByClassroom.get(task.lessons.classroom_id)}</StatusPill> : null}</div><p className="mt-1 text-xs text-slate-500">期限: {formatDate(task.due_at)} · {task.question_ids.length}テーマ</p></div>{(() => {
          const state = progressByAssignment.get(task.id) ?? 'not_started';
          return state === 'in_progress'
            ? <StatusPill tone="blue">進行中</StatusPill>
            : <StatusPill tone="amber">未着手</StatusPill>;
        })()}</div></Link>)}</div> : <EmptyState>いま取り組む説明ワークはありません。学習記録を確認できます。</EmptyState>}
      </Panel>
      <div className="space-y-6"><Panel title="次回の復習">{reviews.data?.length ? <ul className="space-y-3 text-sm">{reviews.data.map((review) => <li key={review.id} className="flex justify-between gap-3"><span>{review.concepts?.name ?? '復習単元'}</span><span className="text-slate-500">{formatDate(review.due_at)}</span></li>)}</ul> : <EmptyState>復習予定はまだありません</EmptyState>}</Panel><Panel title="先生からのお知らせ">{notifications.data?.length ? <ul className="space-y-3">{notifications.data.map((item) => <li key={item.id}><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.body}</p></li>)}</ul> : <EmptyState>新しいお知らせはありません</EmptyState>}</Panel></div>
    </div>
  </div>;
}
