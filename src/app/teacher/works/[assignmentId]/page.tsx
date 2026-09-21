import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';
import {
  DimensionBars, MisconceptionChips, ProgressBar, ScoreRing,
  jsonItems, jsonRecord,
} from '@/components/teacher/analysis';

const STATE_LABELS = { completed: '完了', in_progress: '進行中', not_started: '未着手' } as const;

export default async function WorkAnalysisPage({ params }: PageProps<'/teacher/works/[assignmentId]'>) {
  const context = await requireRole('teacher', 'admin');
  const { assignmentId } = await params;
  const db = await createClient();

  const assignment = await db.from('assignments')
    .select('id,classroom_id,student_id,status,due_at,question_ids,lessons(title),classrooms(name,subject)')
    .eq('tenant_id', context.tenantId).eq('id', assignmentId).maybeSingle();
  if (assignment.error) throw new Error(assignment.error.message);
  if (!assignment.data) notFound();
  const work = assignment.data;

  const question = work.question_ids[0]
    ? await db.from('questions').select('id,body,difficulty,concept_id').eq('tenant_id', context.tenantId).eq('id', work.question_ids[0]).maybeSingle()
    : { data: null, error: null };
  if (question.error) throw new Error(question.error.message);
  const conceptId = question.data?.concept_id ?? null;

  // 配信対象の生徒。個別配信ならその1人、クラス配信なら在籍者全員。
  const enrolled = work.student_id
    ? await db.from('users').select('id,display_name').eq('id', work.student_id)
    : await db.from('enrollments').select('users!enrollments_user_id_fkey(id,display_name)')
        .eq('tenant_id', context.tenantId).eq('classroom_id', work.classroom_id ?? '')
        .eq('role', 'student').eq('active', true);
  if (enrolled.error) throw new Error(enrolled.error.message);
  const students = work.student_id
    ? (enrolled.data as Array<{ id: string; display_name: string }>)
    : (enrolled.data as Array<{ users: { id: string; display_name: string } | null }>).flatMap((row) => row.users ? [row.users] : []);

  const [progress, assessments] = await Promise.all([
    db.from('assignment_progress').select('student_id,status,active_seconds').eq('tenant_id', context.tenantId).eq('assignment_id', assignmentId),
    conceptId
      ? db.from('assessments').select('id,student_id,score,override_score,reviewer_status,component_scores,misconceptions,created_at')
          .eq('tenant_id', context.tenantId).eq('concept_id', conceptId).eq('is_final', true).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (progress.error) throw new Error(progress.error.message);

  const progressByStudent = new Map((progress.data ?? []).map((row) => [row.student_id, row]));
  // 生徒ごとに最新の1件だけを使う。同じお題を作り直した場合の重複を避ける。
  const latestByStudent = new Map<string, NonNullable<typeof assessments.data>[number]>();
  for (const row of assessments.data ?? []) if (!latestByStudent.has(row.student_id)) latestByStudent.set(row.student_id, row);

  const counts = { completed: 0, inProgress: 0, notStarted: 0 };
  for (const student of students) {
    const state = progressByStudent.get(student.id)?.status ?? 'not_started';
    if (state === 'completed') counts.completed += 1;
    else if (state === 'in_progress') counts.inProgress += 1;
    else counts.notStarted += 1;
  }

  const scores = students.flatMap((student) => {
    const row = latestByStudent.get(student.id);
    const value = row ? row.override_score ?? row.score : null;
    return value === null || value === undefined ? [] : [Number(value)];
  });
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const dimensionAverage: Record<string, number> = {};
  for (const key of ['definition', 'logic', 'example', 'accuracy', 'clarity']) {
    const values = [...latestByStudent.values()]
      .map((row) => Number(jsonRecord(jsonRecord(row.component_scores).dimensions)[key] ?? NaN))
      .filter(Number.isFinite);
    if (values.length) dimensionAverage[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  // クラス共通のつまずきを出す。1人だけのものは混ぜない。
  const tally = new Map<string, { item: Record<string, unknown>; count: number }>();
  for (const row of latestByStudent.values()) {
    for (const item of jsonItems(row.misconceptions)) {
      const key = String(item.code ?? item.label ?? '');
      if (!key) continue;
      const current = tally.get(key) ?? { item, count: 0 };
      current.count += 1;
      tally.set(key, current);
    }
  }
  const shared = [...tally.values()].filter((entry) => entry.count >= (students.length > 1 ? 2 : 1))
    .sort((a, b) => b.count - a.count).map((entry) => entry.item);

  return <div>
    <p className="mb-3 text-sm"><Link href="/teacher/assignments" className="font-bold text-[#237d75]">‹ 説明ワーク一覧へ戻る</Link></p>
    <PageTitle
      title={work.lessons?.title ?? '概念説明ワーク'}
      description={`${work.classrooms?.name ?? 'クラス'} · ${work.student_id ? '個別配信' : 'クラス全員'} · Lv.${question.data?.difficulty ?? 2} · 期限 ${formatDate(work.due_at)}`}
    />

    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <Panel title="提出状況" description={`対象 ${students.length}人`}>
        <ProgressBar counts={counts} />
        <div className="mt-6">
          <ScoreRing value={average} caption={average === null ? 'まだ分析できる提出がありません。' : `分析できた提出 ${scores.length}件の平均`} />
        </div>
      </Panel>

      <Panel title="クラスの傾向" description="提出済みの生徒の平均です">
        {Object.keys(dimensionAverage).length
          ? <DimensionBars dimensions={dimensionAverage} />
          : <EmptyState>まだ分析はありません</EmptyState>}
        {shared.length ? <div className="mt-6">
          <p className="mb-2 text-sm font-bold text-[#52637d]">複数の生徒に共通するつまずき</p>
          <MisconceptionChips items={shared} />
        </div> : null}
      </Panel>
    </div>

    {question.data?.body ? <div className="mt-6">
      <Panel title="出したお題">
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{question.data.body}</p>
      </Panel>
    </div> : null}

    <div className="mt-6">
      <Panel title="生徒ごとの結果" description="名前を選ぶと、その生徒の分析を開きます">
        {students.length ? <div className="divide-y divide-slate-100">{students.map((student) => {
          const state = (progressByStudent.get(student.id)?.status ?? 'not_started') as keyof typeof STATE_LABELS;
          const row = latestByStudent.get(student.id);
          const value = row ? row.override_score ?? row.score : null;
          const href = row ? `/teacher/students/${student.id}/assessments/${row.id}` : `/teacher/students/${student.id}`;
          return <Link key={student.id} href={href} className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="truncate font-bold">{student.display_name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {progressByStudent.get(student.id)?.active_seconds
                  ? `取り組み ${Math.round((progressByStudent.get(student.id)?.active_seconds ?? 0) / 60)}分`
                  : '記録なし'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusPill tone={state === 'completed' ? 'emerald' : state === 'in_progress' ? 'blue' : 'amber'}>{STATE_LABELS[state]}</StatusPill>
              <span className="w-12 text-right font-bold tabular-nums">{value === null || value === undefined ? '—' : `${Math.round(Number(value) * 100)}%`}</span>
              <span aria-hidden="true" className="text-sm font-bold text-[#237d75]">›</span>
            </div>
          </Link>;
        })}</div> : <EmptyState>配信対象の生徒がいません</EmptyState>}
      </Panel>
    </div>
  </div>;
}
