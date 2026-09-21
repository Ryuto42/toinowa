import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate, formatDateTime } from '@/lib/shared/format';
import {
  DimensionBars, MisconceptionChips, PlanTimeline, ScoreRing, ScoreTrend,
  jsonItems, jsonRecord,
} from '@/components/teacher/analysis';

const REVIEW_LABELS: Record<string, string> = {
  pending_review: '確認が必要', auto_approved: '自動分析済み', approved: '先生が確認済み',
  rejected: '却下済み', overridden: '先生が修正済み',
};

export default async function TeacherStudentPage({ params }: PageProps<'/teacher/students/[id]'>) {
  const context = await requireRole('teacher', 'admin');
  const { id } = await params;
  await assertStudentScope(context, id);
  const db = await createClient();
  const [user, profile, assessments, plans, reviews, escalations, progress] = await Promise.all([
    db.from('users').select('*').eq('id', id).maybeSingle(),
    db.from('student_profiles').select('*').eq('user_id', id).maybeSingle(),
    db.from('assessments').select('id,concept_id,score,override_score,confidence,reviewer_status,component_scores,misconceptions,created_at,concepts(name)')
      .eq('student_id', id).eq('is_final', true).order('created_at', { ascending: false }),
    db.from('learning_plans').select('*,classrooms(name)').eq('student_id', id).order('created_at', { ascending: false }).limit(8),
    db.from('review_schedules').select('*,concepts(name)').eq('student_id', id).is('fulfilled_at', null).order('due_at').limit(6),
    db.from('escalations').select('id,kind,title,priority,created_at').eq('student_id', id).in('status', ['open', 'acknowledged']).order('created_at', { ascending: false }),
    db.from('assignment_progress').select('assignment_id,status,active_seconds,completed_at').eq('student_id', id),
  ]);
  if (!user.data) notFound();

  const rows = assessments.data ?? [];
  // 概念ごとの最新だけを「今の理解度」として使う。同じ概念の古い評価は履歴として残す。
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.concept_id)) latest.set(row.concept_id, row);
  const current = [...latest.values()];
  const scored = current.filter((row) => row.reviewer_status !== 'rejected' && (row.override_score ?? row.score) !== null);
  const average = scored.length
    ? scored.reduce((sum, row) => sum + Number(row.override_score ?? row.score), 0) / scored.length
    : null;
  const pending = current.filter((row) => row.reviewer_status === 'pending_review');

  // 観点別は最新の評価5件を平均する。1件だけだとその日の出来に振り回される。
  const dimensionAverage: Record<string, number> = {};
  const recent = current.slice(0, 5);
  for (const key of ['definition', 'logic', 'example', 'accuracy', 'clarity']) {
    const values = recent.map((row) => Number(jsonRecord(jsonRecord(row.component_scores).dimensions)[key] ?? NaN)).filter(Number.isFinite);
    if (values.length) dimensionAverage[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  const misconceptions = current.flatMap((row) => jsonItems(row.misconceptions)).slice(0, 8);
  const trend = [...rows].reverse().slice(-8).map((row) => ({
    label: row.concepts?.name ?? '概念',
    value: row.override_score ?? row.score === null ? null : Number(row.override_score ?? row.score),
  }));
  const planTasks = jsonItems(plans.data?.[0]?.tasks);
  const progressCounts = (progress.data ?? []).reduce((acc, row) => {
    if (row.status === 'completed') acc.completed += 1; else acc.inProgress += 1;
    return acc;
  }, { completed: 0, inProgress: 0 });

  return <div>
    <PageTitle
      title={user.data.display_name}
      description={`学年 ${profile.data?.grade ?? '未設定'}。概念ごとの理解度と、次に取り組むことをまとめています。`}
    />

    {pending.length ? <div role="status" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">先生の確認が必要な分析が{pending.length}件あります</p>
      <p className="mt-1">観測が少なく、AIの確信度が低い評価です。根拠を見て必要なら点数を修正してください。</p>
    </div> : null}

    {escalations.data?.length ? <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm font-bold text-rose-800">対応待ちの介入が{escalations.data.length}件</p>
      <ul className="mt-2 space-y-1 text-sm text-rose-900">
        {escalations.data.slice(0, 3).map((item) => <li key={item.id}>・{item.title}</li>)}
      </ul>
      <Link href="/teacher/interventions" className="mt-2 inline-block text-sm font-bold text-rose-800 underline">介入管理で見る</Link>
    </div> : null}

    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel title="いまの理解度" description={`${current.length}概念の最新評価から算出`}>
        <ScoreRing value={average} caption={average === null ? '説明ワークの提出を待っています。' : `完了 ${progressCounts.completed}件 / 取り組み中 ${progressCounts.inProgress}件`} />
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-[#f3f7f7] p-3">
            <p className="text-xs text-[#8a9ab2]">学習継続</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{profile.data?.streak_days ?? 0}日</p>
          </div>
          <div className="rounded-xl bg-[#f3f7f7] p-3">
            <p className="text-xs text-[#8a9ab2]">いまの難易度</p>
            <p className="mt-1 text-xl font-bold">Lv.{profile.data?.current_difficulty ?? 2}</p>
          </div>
        </div>
      </Panel>

      <Panel title="観点別の強み・弱み" description="直近の評価を平均しています">
        {Object.keys(dimensionAverage).length
          ? <DimensionBars dimensions={dimensionAverage} />
          : <EmptyState>まだ観点別の分析はありません</EmptyState>}
        {misconceptions.length ? <div className="mt-6">
          <p className="mb-2 text-sm font-bold text-[#52637d]">繰り返し出ているつまずき</p>
          <MisconceptionChips items={misconceptions} />
        </div> : null}
      </Panel>
    </div>

    {trend.length >= 2 ? <div className="mt-6">
      <Panel title="理解度の推移" description="左が古く、右が新しい提出です">
        <ScoreTrend points={trend} />
      </Panel>
    </div> : null}

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="提出ごとの分析" description="行を選ぶと、その説明ワークの詳しい分析を開きます">
        {rows.length ? <div className="divide-y divide-slate-100">{rows.map((row) => {
          const score = row.override_score ?? row.score;
          return <Link key={row.id} href={`/teacher/students/${id}/assessments/${row.id}`}
            className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="truncate font-bold">{row.concepts?.name ?? '概念'}</p>
              <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(row.created_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {row.reviewer_status === 'pending_review'
                ? <StatusPill tone="amber">{REVIEW_LABELS[row.reviewer_status]}</StatusPill>
                : row.reviewer_status === 'overridden'
                  ? <StatusPill tone="blue">{REVIEW_LABELS[row.reviewer_status]}</StatusPill>
                  : null}
              <span className="w-12 text-right font-bold tabular-nums">{score === null ? '—' : `${Math.round(Number(score) * 100)}%`}</span>
              <span aria-hidden="true" className="text-sm font-bold text-[#237d75]">›</span>
            </div>
          </Link>;
        })}</div> : <EmptyState>説明を送信するとAI評価が表示されます</EmptyState>}
      </Panel>

      <div className="space-y-6">
        <div id="learning-plan"><Panel title="学習計画と変更理由" description="先生向けの提案です。計画が更新されても、新しい課題は承認するまで配信されません。">
          {plans.data?.[0] ? <div className="mb-5 space-y-3">
            <p className="text-xs text-slate-500">{plans.data[0].classrooms?.name ?? 'クラス未設定'} · 最新の提案 · {formatDateTime(plans.data[0].created_at)} · {plans.data[0].preparation_id ? '授業記録を受けて作成' : plans.data[0].source_assessment_id ? '説明の評価を受けて更新' : '登録情報・模試などをもとに作成'}</p>
            <p className="whitespace-pre-wrap rounded-xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">{plans.data[0].rationale}</p>
            {Array.isArray(plans.data[0].review_notes) ? plans.data[0].review_notes.map((note,index) => <p key={index} className="text-sm text-amber-800">{String(note)}</p>) : null}
            {plans.data[0].source_assessment_id ? <Link className="block text-sm font-bold text-emerald-800 underline" href={`/teacher/students/${id}/assessments/${plans.data[0].source_assessment_id}`}>今回の変更の根拠となった説明・評価を見る</Link> : null}
            <Link href="/teacher/assignments#review" className="block text-sm font-bold text-emerald-800 underline">課題案を確認して配信する</Link>
          </div> : null}
          {planTasks.length ? <PlanTimeline tasks={planTasks} /> : <EmptyState>授業記録や模試の分析後に、学習計画が届きます。</EmptyState>}
          {(plans.data?.length ?? 0)>1 ? <details className="mt-5 border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-bold">過去の提案・他クラスの計画を見る</summary><div className="mt-4 space-y-5">{plans.data?.slice(1).map(plan => <div key={plan.id}><p className="text-xs text-slate-500">{plan.classrooms?.name ?? 'クラス未設定'} · {formatDateTime(plan.created_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{plan.rationale}</p><PlanTimeline tasks={jsonItems(plan.tasks)} /></div>)}</div></details> : null}
        </Panel></div>
        <Panel title="復習の予定">
          {reviews.data?.length ? <ul className="space-y-2 text-sm">
            {reviews.data.map((review) => <li key={review.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f7faf9] px-3 py-2">
              <span className="truncate">{review.concepts?.name ?? '復習単元'}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatDate(review.due_at)}</span>
            </li>)}
          </ul> : <EmptyState>復習予定はありません</EmptyState>}
        </Panel>
      </div>
    </div>
  </div>;
}
