import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate, formatDateTime } from '@/lib/shared/format';
import { DimensionBars, MisconceptionChips, ScoreRing, ScoreTrend, jsonItems, jsonRecord } from '@/components/teacher/analysis';
import { HandoffList } from '@/components/teacher/handoff-list';

const PROGRESS_LABELS: Record<string, { label: string; tone: 'emerald' | 'amber' | 'slate' }> = {
  completed: { label: '完了', tone: 'emerald' },
  in_progress: { label: '進行中', tone: 'amber' },
  not_started: { label: '未着手', tone: 'slate' },
};

export default async function AdminStudentPage({ params }: PageProps<'/admin/students/[id]'>) {
  const context = await requireRole('admin');
  const { id } = await params;
  const db = await createClient();

  const [user, profile, enrollments, assessments, escalations, handoffs, staff] = await Promise.all([
    db.from('users').select('id,display_name,status,login_identifier,created_at').eq('tenant_id', context.tenantId).eq('id', id).eq('role', 'student').maybeSingle(),
    db.from('student_profiles').select('*').eq('tenant_id', context.tenantId).eq('user_id', id).maybeSingle(),
    db.from('enrollments').select('classroom_id,classrooms(name,individual_student_id,archived_at)').eq('tenant_id', context.tenantId).eq('user_id', id).eq('role', 'student').eq('active', true),
    db.from('assessments').select('id,concept_id,score,override_score,confidence,reviewer_status,component_scores,misconceptions,created_at,concepts(name)')
      .eq('tenant_id', context.tenantId).eq('student_id', id).eq('is_final', true).order('created_at', { ascending: false }),
    db.from('escalations').select('id,kind,title,priority,created_at').eq('tenant_id', context.tenantId).eq('student_id', id).in('status', ['open', 'acknowledged']).order('created_at', { ascending: false }),
    db.from('handoffs').select('*').eq('tenant_id', context.tenantId).eq('student_id', id).order('created_at', { ascending: false }).limit(20),
    db.from('users').select('id,display_name').eq('tenant_id', context.tenantId).in('role', ['teacher', 'admin']),
  ]);
  if (!user.data) notFound();

  const classroomIds = (enrollments.data ?? []).flatMap((row) => row.classrooms?.archived_at ? [] : [row.classroom_id]);
  const classroomNames = (enrollments.data ?? []).flatMap((row) =>
    row.classrooms && !row.classrooms.archived_at && !row.classrooms.individual_student_id ? [row.classrooms.name] : []);

  // クラス一斉の課題は student_id が空なので、在籍クラスの分もあわせて拾う。
  const [assignedToStudent, assignedToClass, progress] = await Promise.all([
    db.from('assignments').select('id,due_at,status,question_ids,lessons(title),classrooms(name)')
      .eq('tenant_id', context.tenantId).eq('student_id', id).in('status', ['published', 'completed']),
    classroomIds.length
      ? db.from('assignments').select('id,due_at,status,question_ids,lessons(title),classrooms(name)')
          .eq('tenant_id', context.tenantId).is('student_id', null).in('classroom_id', classroomIds).in('status', ['published', 'completed'])
      : Promise.resolve({ data: [], error: null }),
    db.from('assignment_progress').select('assignment_id,status,active_seconds,completed_at').eq('tenant_id', context.tenantId).eq('student_id', id),
  ]);

  const assignments = [...(assignedToStudent.data ?? []), ...(assignedToClass.data ?? [])];
  const questionIds = [...new Set(assignments.flatMap((row) => row.question_ids))];
  const questions = questionIds.length
    ? await db.from('questions').select('id,concept_id').eq('tenant_id', context.tenantId).in('id', questionIds)
    : { data: [], error: null };
  const conceptByQuestion = new Map((questions.data ?? []).map((row) => [row.id, row.concept_id]));
  const progressByAssignment = new Map((progress.data ?? []).map((row) => [row.assignment_id, row]));

  const rows = assessments.data ?? [];
  // 評価は概念ごとに最新の1件を「いまの理解度」とする。古い評価は推移として残す。
  const latestByConcept = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latestByConcept.has(row.concept_id)) latestByConcept.set(row.concept_id, row);
  const current = [...latestByConcept.values()];
  const scored = current.filter((row) => row.reviewer_status !== 'rejected' && (row.override_score ?? row.score) !== null);
  const average = scored.length ? scored.reduce((sum, row) => sum + Number(row.override_score ?? row.score), 0) / scored.length : null;

  const dimensionAverage: Record<string, number> = {};
  for (const key of ['definition', 'logic', 'example', 'accuracy', 'clarity']) {
    const values = current.slice(0, 5).map((row) => Number(jsonRecord(jsonRecord(row.component_scores).dimensions)[key] ?? NaN)).filter(Number.isFinite);
    if (values.length) dimensionAverage[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  const misconceptions = current.flatMap((row) => jsonItems(row.misconceptions)).slice(0, 8);
  const trend = [...rows].reverse().slice(-8).map((row) => ({
    label: row.concepts?.name ?? '概念',
    value: row.override_score ?? row.score === null ? null : Number(row.override_score ?? row.score),
  }));

  const counts = assignments.reduce((acc, assignment) => {
    const state = progressByAssignment.get(assignment.id)?.status ?? 'not_started';
    acc[state] = (acc[state] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const names = Object.fromEntries([...(staff.data ?? []).map((row) => [row.id, row.display_name] as const), [id, user.data.display_name] as const]);

  return <div>
    <PageTitle
      title={user.data.display_name}
      description={`${profile.data?.grade ?? '学年未設定'} · ${classroomNames.join(' · ') || 'クラス未設定'} · ログインID ${user.data.login_identifier ?? '—'}`}
      action={<Link href={`/admin/users/${id}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">ユーザー情報を編集</Link>}
    />

    {escalations.data?.length ? <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm font-bold text-rose-800">要フォローの項目が{escalations.data.length}件</p>
      <ul className="mt-2 space-y-1 text-sm text-rose-900">
        {escalations.data.slice(0, 3).map((item) => <li key={item.id}>・{item.title}</li>)}
      </ul>
      <Link href="/admin/interventions" className="mt-2 inline-block text-sm font-bold text-rose-800 underline">要フォロー一覧で見る</Link>
    </div> : null}

    <div className="mb-6 grid gap-4 sm:grid-cols-4">
      <MetricCard label="配信された課題" value={assignments.length} />
      <MetricCard label="完了" value={counts.completed ?? 0} tone="emerald" />
      <MetricCard label="進行中" value={counts.in_progress ?? 0} tone={counts.in_progress ? 'amber' : 'slate'} />
      <MetricCard label="未着手" value={counts.not_started ?? 0} tone={counts.not_started ? 'amber' : 'slate'} />
    </div>

    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel title="いまの理解度" description={`${current.length}概念の最新評価から算出`}>
        <ScoreRing value={average} caption={average === null ? 'まだ評価がありません。' : `学習継続 ${profile.data?.streak_days ?? 0}日 · 最終活動 ${profile.data?.last_active_on ?? '—'}`} />
      </Panel>
      <Panel title="観点別の強み・弱み" description="直近の評価を平均しています">
        {Object.keys(dimensionAverage).length ? <DimensionBars dimensions={dimensionAverage} /> : <EmptyState>まだ観点別の分析はありません</EmptyState>}
        {misconceptions.length ? <div className="mt-6">
          <p className="mb-2 text-sm font-bold text-[#52637d]">繰り返し出ているつまずき</p>
          <MisconceptionChips items={misconceptions} />
        </div> : null}
      </Panel>
    </div>

    {trend.length >= 2 ? <div className="mt-6"><Panel title="理解度の推移" description="左が古く、右が新しい提出です"><ScoreTrend points={trend} /></Panel></div> : null}

    <div className="mt-6">
      <Panel title="課題の提出状況" description="クラス一斉の課題と、この生徒あての課題をまとめています">
        {assignments.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500"><tr className="border-b border-slate-200">
            <th scope="col" className="py-2 pr-4 font-semibold">お題</th>
            <th scope="col" className="hidden py-2 pr-4 font-semibold sm:table-cell">クラス</th>
            <th scope="col" className="hidden py-2 pr-4 text-right font-semibold sm:table-cell">期限</th>
            <th scope="col" className="py-2 pr-4 text-right font-semibold">状態</th>
            <th scope="col" className="hidden py-2 pr-4 text-right font-semibold sm:table-cell">提出日時</th>
            <th scope="col" className="py-2 text-right font-semibold">評価</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {assignments.map((assignment) => {
              const state = progressByAssignment.get(assignment.id);
              const label = PROGRESS_LABELS[state?.status ?? 'not_started'];
              const conceptId = assignment.question_ids[0] ? conceptByQuestion.get(assignment.question_ids[0]) : null;
              const assessment = conceptId ? latestByConcept.get(conceptId) : null;
              const score = assessment ? assessment.override_score ?? assessment.score : null;
              return <tr key={assignment.id}>
                <td className="py-3 pr-4 font-bold">{assignment.lessons?.title ?? '説明課題'}</td>
                <td className="hidden py-3 pr-4 text-slate-500 sm:table-cell">{assignment.classrooms?.name ?? '—'}</td>
                <td className="hidden whitespace-nowrap py-3 pr-4 text-right text-slate-500 sm:table-cell">{formatDate(assignment.due_at)}</td>
                <td className="py-3 pr-4 text-right"><StatusPill tone={label.tone}>{label.label}</StatusPill></td>
                <td className="hidden whitespace-nowrap py-3 pr-4 text-right text-slate-500 sm:table-cell">{state?.completed_at ? formatDateTime(state.completed_at) : '—'}</td>
                <td className="py-3 text-right tabular-nums">{score === null ? '—' : `${Math.round(Number(score) * 100)}点`}</td>
              </tr>;
            })}
          </tbody>
        </table></div> : <EmptyState>配信された課題はありません</EmptyState>}
      </Panel>
    </div>

    {rows.length ? <div className="mt-6"><Panel title="評価の記録" description="提出ごとのAI分析です">
      <div className="space-y-3">{rows.map((row) => <details key={row.id} className="rounded-xl border border-slate-200 p-4">
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm">
          <span className="font-bold">{row.concepts?.name ?? '単元'}</span>
          <span className="text-slate-500">{formatDateTime(row.created_at)}</span>
          <span className="ml-auto font-bold tabular-nums">
            {(row.override_score ?? row.score) === null ? '—' : `${Math.round(Number(row.override_score ?? row.score) * 100)}点`}
          </span>
        </summary>
        <div className="mt-4">
          <DimensionBars dimensions={Object.fromEntries(Object.entries(jsonRecord(jsonRecord(row.component_scores).dimensions)).map(([key, value]) => [key, Number(value)]).filter(([, value]) => Number.isFinite(value))) as Record<string, number>} />
          {jsonItems(row.misconceptions).length ? <div className="mt-4"><MisconceptionChips items={jsonItems(row.misconceptions)} /></div> : null}
        </div>
      </details>)}</div>
    </Panel></div> : null}

    {handoffs.data?.length ? <div className="mt-6"><Panel title="引き継ぎの履歴" description="この生徒を誰から誰へ渡したかの記録です">
      <HandoffList initial={handoffs.data} mode="admin" names={names} linkStudents={false} studentBase="/admin/students" />
    </Panel></div> : null}
  </div>;
}
