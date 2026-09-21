import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

const PROGRESS = {
  not_started: { label: '未着手', tone: 'amber' as const, cta: 'AIと始める' },
  in_progress: { label: '進行中', tone: 'blue' as const, cta: '続きから' },
  completed: { label: '完了', tone: 'emerald' as const, cta: '振り返りを見る' },
};

export default async function StudentStudyPage() {
  const context = await requireRole('student');
  const db = await createClient();
  const [tasks, classrooms, progress] = await Promise.all([
    db.from('assignments').select('*, lessons(title,classroom_id)')
      .eq('tenant_id', context.tenantId).in('status', ['published', 'completed']).order('due_at'),
    db.from('classrooms').select('id,subject').eq('tenant_id', context.tenantId),
    // 進捗は生徒ごとの行。行が無ければ未着手。
    db.from('assignment_progress').select('assignment_id,status').eq('student_id', context.userId),
  ]);
  const subjectByClassroom = new Map((classrooms.data ?? []).map((classroom) => [classroom.id, classroom.subject]));
  const progressByAssignment = new Map((progress.data ?? []).map((row) => [row.assignment_id, row.status]));
  const items = (tasks.data ?? []).map((task) => ({
    task,
    state: (progressByAssignment.get(task.id) ?? 'not_started') as keyof typeof PROGRESS,
  }));
  // 進行中を先頭、完了は最後。取りかかるべきものが上に来るようにする。
  const order = { in_progress: 0, not_started: 1, completed: 2 };
  items.sort((a, b) => order[a.state] - order[b.state]);

  return <div>
    <PageTitle title="AIワーク" description="AIに説明することで、理解があいまいなところを見つけます。" />
    <Panel title="説明するテーマ">
      {items.length ? <div className="divide-y divide-slate-100">{items.map(({ task, state }) => {
        const view = PROGRESS[state];
        const subject = task.lessons?.classroom_id ? subjectByClassroom.get(task.lessons.classroom_id) : null;
        return <article key={task.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{task.lessons?.title ?? '概念説明ワーク'}</h2>
              {subject ? <StatusPill tone="blue">{subject}</StatusPill> : null}
              <StatusPill tone={view.tone}>{view.label}</StatusPill>
            </div>
            <p className="mt-1 text-sm text-slate-500">{task.question_ids.length}テーマ · 期限 {formatDate(task.due_at)}</p>
          </div>
          <Link
            href={state === 'completed' ? '/student/records' : `/student/study/${task.id}`}
            className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold ${state === 'completed' ? 'border border-slate-300 text-slate-700' : 'bg-emerald-700 text-white'}`}
          >
            {view.cta}
          </Link>
        </article>;
      })}</div> : <EmptyState>配信された説明ワークはありません</EmptyState>}
    </Panel>
  </div>;
}
