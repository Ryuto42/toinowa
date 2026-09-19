import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { EmptyState, MetricCard, PageTitle, Panel, ScoreBar, StatusPill } from '@/components/dashboard';
import { formatUsd } from '@/lib/shared/format';

export default async function TeacherDashboardPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [classes, assessments, escalations, approvals, runs] = await Promise.all([
    db.from('classrooms').select('*').eq('tenant_id', context.tenantId),
    db.from('assessments').select('*, users(display_name), concepts(name)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(100),
    db.from('escalations').select('*, users!escalations_student_id_fkey(display_name)').eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).order('priority').limit(10),
    db.from('approvals').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).is('decision', null),
    adminDb().from('agent_runs').select('status,estimated_cost_usd,fallback_count').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(500),
  ]);
  const rows = assessments.data ?? [];
  const scores = rows.flatMap((row) => row.score === null ? [] : [Number(row.override_score ?? row.score)]);
  const runRows = runs.data ?? [];
  const cost = runRows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
  const conceptScores = new Map<string, { name: string; values: number[] }>();
  for (const row of rows) {
    if (row.score === null) continue;
    const current = conceptScores.get(row.concept_id) ?? { name: row.concepts?.name ?? '単元', values: [] };
    current.values.push(Number(row.override_score ?? row.score)); conceptScores.set(row.concept_id, current);
  }
  return <div><PageTitle eyebrow="Teacher Dashboard" title="クラスの現在地" description="評価の根拠、介入候補、AIの動作状況を同じ画面で確認できます。"/>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="平均理解度" value={scores.length ? `${Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 100)}%` : '—'}/><MetricCard label="要介入" value={escalations.data?.length ?? 0} tone={(escalations.data?.length ?? 0) ? 'rose' : 'emerald'}/><MetricCard label="承認待ち" value={approvals.count ?? 0} tone={(approvals.count ?? 0) ? 'amber' : 'emerald'}/><MetricCard label="AI費用（直近）" value={formatUsd(cost)} note={`${runRows.length}処理・フォールバック ${runRows.reduce((a,b) => a+b.fallback_count, 0)}回`} tone="slate"/></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"><Panel title="単元別理解度" description={`${classes.data?.length ?? 0}クラスの観測データ`}>
      {conceptScores.size ? <div className="space-y-5">{[...conceptScores.entries()].slice(0, 8).map(([id, item]) => <div key={id}><div className="mb-2 flex justify-between text-sm"><span className="font-bold">{item.name}</span><span className="text-slate-500">{item.values.length}件</span></div><ScoreBar value={item.values.reduce((a,b) => a+b,0)/item.values.length}/></div>)}</div> : <EmptyState>評価データが入ると単元ごとの傾向を表示します</EmptyState>}
    </Panel><Panel title="介入候補" action={<Link href="/teacher/interventions" className="text-xs font-bold text-emerald-700">すべて見る</Link>}>
      {escalations.data?.length ? <div className="space-y-4">{escalations.data.slice(0,5).map((item) => <Link href="/teacher/interventions" key={item.id} className="block"><div className="flex items-center gap-2"><StatusPill tone={item.priority === 'urgent' ? 'rose' : 'amber'}>{item.priority}</StatusPill><span className="text-xs text-slate-500">{item.users?.display_name}</span></div><p className="mt-2 text-sm font-bold">{item.title}</p></Link>)}</div> : <EmptyState>現在、介入候補はありません</EmptyState>}
    </Panel></div>
  </div>;
}
