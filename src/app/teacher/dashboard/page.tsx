import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { OpsAutoRefresh } from '@/components/teacher/ops-auto-refresh';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { EmptyState, MetricCard, PageTitle, Panel, ScoreBar, StatusPill } from '@/components/dashboard';

export default async function TeacherDashboardPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [assessments, concepts, escalations, analyzed, runs, drafts] = await Promise.all([
    db.from('assessments').select('score,override_score,concept_id').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(100),
    db.from('concepts').select('id,name').eq('tenant_id', context.tenantId),
    db.from('escalations').select('id,title,priority,status').eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).order('created_at', { ascending: false }).limit(5),
    db.from('assessments').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId),
    // agent_runs は内部表でRLSポリシーを持たないため、service role で読む。
    adminDb().from('agent_runs').select('estimated_cost_usd').eq('tenant_id', context.tenantId),
    db.from('assignments').select('id', {count:'exact',head:true}).eq('tenant_id',context.tenantId).eq('status','draft'),
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
    <OpsAutoRefresh />
    <PageTitle title="授業のあとを、AIと一緒に" description="先生はわかりやすく教える。AIは復習の設計・対話・分析を進め、次の学習を提案します。" />
    <div className="mb-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <p className="text-lg font-bold text-emerald-950">{drafts.count ? `確認を待っている課題が${drafts.count}件あります` : '今日の授業記録を渡してください'}</p>
      <p className="mt-2 text-sm leading-7 text-emerald-900">授業メモ・プリント・板書の写真から、生徒別の課題と学習計画を準備します。先生が確認して配信すると、生徒がAIへの説明に取り組めます。</p>
      <div className="mt-4 flex flex-wrap gap-3"><Link href="/teacher/assignments" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">授業記録を渡す</Link>{drafts.count ? <Link href="/teacher/assignments#review" className="rounded-xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-800">課題案を確認して配信</Link> : null}</div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="平均理解度" value={average === null ? '—' : `${average}%`} note={average === null ? 'データ収集中' : `${scores.length}単元の観測データ`} />
      <MetricCard label="要フォロー" value={escalations.data?.length ?? 0} tone={escalations.data?.length ? 'rose' : 'emerald'} note="緊急対応が必要な生徒" />
      <MetricCard label="AI分析済み" value={analyzed.count ?? 0} tone="slate" note="説明ワークの分析件数" />
      <MetricCard label="AI費用（直近）" value={`$${cost.toFixed(4)}`} tone="slate" note="記録されたAI実行・フォールバックを含む" />
    </div>

    <div className="mt-9 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel title="単元別理解度" description="1クラスの観測データ">
        {latestByConcept.size ? <div className="space-y-5">{[...latestByConcept.entries()].slice(0, 8).map(([conceptId, score]) => <div key={conceptId}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-[#34445f]">{conceptNames.get(conceptId) ?? '学習単元'}</span><span className="text-xs text-[#8a9ab2]">最新の評価</span></div><ScoreBar value={score} /></div>)}</div> : <EmptyState><span className="text-2xl text-[#c5d3e4]">▥</span><span className="mt-2 block">評価データが入ると単元ごとの傾向を表示します</span></EmptyState>}
      </Panel>
      <Panel title="要フォロー" action={<Link href="/teacher/interventions" className="text-xs font-bold text-[#237d75]">すべて見る　›</Link>}>
        {escalations.data?.length ? <div className="space-y-3">{escalations.data.map((item) => <Link key={item.id} href="/teacher/interventions" className="flex items-center justify-between gap-3 rounded-2xl border border-[#edf0f2] p-4 hover:border-[#b9dcd5]"><div><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-[#8a9ab2]">優先度: {item.priority}</p></div><StatusPill tone={item.priority === 'urgent' ? 'rose' : 'amber'}>{item.status === 'open' ? '未対応' : '確認中'}</StatusPill></Link>)}</div> : <EmptyState><span className="text-2xl text-[#c5d3e4]">♢</span><span className="mt-2 block">いま要フォローの生徒はいません</span></EmptyState>}
      </Panel>
    </div>
  </div>;
}
