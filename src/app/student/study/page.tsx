import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

export default async function StudentStudyPage() {
  const context = await requireRole('student');
  const db = await createClient();
  const [tasks, classrooms] = await Promise.all([
    db.from('assignments').select('*, lessons(title,classroom_id)').eq('tenant_id', context.tenantId).in('status', ['published', 'completed']).order('due_at'),
    db.from('classrooms').select('id,subject').eq('tenant_id', context.tenantId),
  ]);
  const subjectByClassroom = new Map((classrooms.data ?? []).map((classroom) => [classroom.id, classroom.subject]));
  return <div>
    <PageTitle title="AIワーク" />
    <Panel title="説明するテーマ">
      {tasks.data?.length ? <div className="divide-y divide-slate-100">{tasks.data.map((task) => <article key={task.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">{task.lessons?.title ?? '概念説明ワーク'}</h2>
            {task.lessons?.classroom_id && subjectByClassroom.get(task.lessons.classroom_id) ? <StatusPill tone="blue">{subjectByClassroom.get(task.lessons.classroom_id)}</StatusPill> : null}
            <StatusPill tone={task.status === 'completed' ? 'emerald' : 'amber'}>{task.status === 'completed' ? '完了' : '学習中'}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-slate-500">{task.question_ids.length}テーマ · 期限 {formatDate(task.due_at)}</p>
        </div>
        <Link href={`/student/study/${task.id}`} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-center text-sm font-bold text-white">AIと始める</Link>
      </article>)}</div> : <EmptyState>配信された説明ワークはありません</EmptyState>}
    </Panel>
  </div>;
}
