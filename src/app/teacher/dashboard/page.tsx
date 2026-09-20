import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel, ScoreBar, StatusPill } from '@/components/dashboard';

export default async function TeacherDashboardPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [assessments, concepts, escalations, approvals, runs] = await Promise.all([
    db.from('assessments').select('score,override_score,concept_id').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(100),
    db.from('concepts').select('id,name').eq('tenant_id', context.tenantId),
    db.from('escalations').select('id,title,priority,status').eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).order('created_at', { ascending: false }).limit(5),
    db.from('approvals').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).is('decision', null),
    db.from('agent_runs').select('estimated_cost_usd').eq('tenant_id', context.tenantId),
  ]);
  const conceptNames = new Map((concepts.data ?? []).map((concept) => [concept.id, concept.name]));
  const latestByConcept = new Map<string, number | null>();
  for (const item of assessments.data ?? []) {
    if (!latestByConcept.has(item.concept_id)) latestByConcept.set(item.concept_id, item.override_score ?? item.score);
  }
  const scores = [...latestByConcept.values()].filter((score): score is number => score !== null);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 100) : null;
  const cost = (runs.data ?? []).reduce((sum, run) => sum + Number(run.estimated_cost_usd ?? 0), 0);

  return <div>
    <PageTitle title="ダッシュボード" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="平均理解度" value={average === null ? '—' : `${average}%`} note={average === null ? 'データ収集中' : `${scores.length}単元の観測データ`} />
      <MetricCard label="要介入" value={escalations.data?.length ?? 0} tone={escalations.data?.length ? 'rose' : 'emerald'} note="緊急対応が必要な生徒" />
      <MetricCard label="承認待ち" value={approvals.count ?? 0} tone={approvals.count ? 'amber' : 'emerald'} note="未処理のタスク" />
      <MetricCard label="AI費用（直近）" value={`$${cost.toFixed(4)}`} tone="slate" note="記録されたAI実行・フォールバックを含む" />
    </div>

    <div className="mt-9 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel title="単元別理解度" description="1クラスの観測データ">
        {latestByConcept.size ? <div className="space-y-5">{[...latestByConcept.entries()].slice(0, 8).map(([conceptId, score]) => <div key={conceptId}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-[#34445f]">{conceptNames.get(conceptId) ?? '学習単元'}</span><span className="text-xs text-[#8a9ab2]">最新の評価</span></div><ScoreBar value={score} /></div>)}</div> : <EmptyState><span className="text-2xl text-[#c5d3e4]">▥</span><span className="mt-2 block">評価データが入ると単元ごとの傾向を表示します</span></EmptyState>}
      </Panel>
      <Panel title="介入候補" action={<Link href="/teacher/interventions" className="text-xs font-bold text-[#237d75]">すべて見る　›</Link>}>
        {escalations.data?.length ? <div className="space-y-3">{escalations.data.map((item) => <Link key={item.id} href="/teacher/interventions" className="flex items-center justify-between gap-3 rounded-2xl border border-[#edf0f2] p-4 hover:border-[#b9dcd5]"><div><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-[#8a9ab2]">優先度: {item.priority}</p></div><StatusPill tone={item.priority === 'urgent' ? 'rose' : 'amber'}>{item.status === 'open' ? '未対応' : '確認中'}</StatusPill></Link>)}</div> : <EmptyState><span className="text-2xl text-[#c5d3e4]">♢</span><span className="mt-2 block">現在、介入候補はありません</span></EmptyState>}
      </Panel>
    </div>
  </div>;
}
