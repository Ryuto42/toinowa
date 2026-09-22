import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { OpsAutoRefresh } from '@/components/teacher/ops-auto-refresh';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel, ScoreBar, StatusPill } from '@/components/dashboard';

export default async function TeacherDashboardPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const weekAgo = new Date(new Date().getTime() - 7 * 86_400_000).toISOString();
  const [assessments, concepts, escalations, drafts, weekAnswers] = await Promise.all([
    db.from('assessments').select('score,override_score,concept_id,student_id').eq('tenant_id', context.tenantId).neq('reviewer_status', 'rejected').order('created_at', { ascending: false }).limit(100),
    db.from('concepts').select('id,name').eq('tenant_id', context.tenantId),
    db.from('escalations').select('id,title,priority,status', { count: 'exact' }).eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).order('created_at', { ascending: false }).limit(5),
    db.from('assignments').select('id', {count:'exact',head:true}).eq('tenant_id',context.tenantId).eq('status','draft'),
    db.from('answers').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).gte('answered_at', weekAgo),
  ]);
  for (const result of [assessments, concepts, escalations, drafts, weekAnswers]) if (result.error) throw new Error(result.error.message);
  const conceptNames = new Map((concepts.data ?? []).map((concept) => [concept.id, concept.name]));
  const latestByConcept = new Map<string, number | null>();
  const seen = new Set<string>();
  const scoresByConcept = new Map<string, number[]>();
  for (const item of assessments.data ?? []) {
    const key = `${item.student_id}:${item.concept_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const score = item.override_score ?? item.score;
    if (score !== null) scoresByConcept.set(item.concept_id, [...(scoresByConcept.get(item.concept_id) ?? []), score]);
  }
  for (const [id, values] of scoresByConcept) latestByConcept.set(id, values.reduce((sum, value) => sum + value, 0) / values.length);
  const scores = [...latestByConcept.values()].filter((score): score is number => score !== null);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 100) : null;

  return <div>
    <OpsAutoRefresh />
    <PageTitle title="ダッシュボード" description="授業の記録を渡すと、AIが課題づくりから対話・分析まで進めます。" />
    <div className="mb-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <p className="text-lg font-bold text-emerald-950">{drafts.count ? `確認を待っている課題が${drafts.count}件あります` : '今日の授業記録を渡してください'}</p>
      <p className="mt-2 text-sm leading-7 text-emerald-900">授業メモ・プリント・板書の写真から、生徒ごとの課題を用意します。確認して配信するだけで完了です。</p>
      <div className="mt-4 flex flex-wrap gap-3"><Link href="/teacher/assignments" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">授業記録を渡す</Link>{drafts.count ? <Link href="/teacher/assignments#review" className="rounded-xl border border-emerald-700 px-4 py-3 text-sm font-bold text-emerald-800">課題案を確認して配信</Link> : null}</div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="確認待ちの課題" value={drafts.count ?? 0} tone={drafts.count ? 'amber' : 'emerald'} note={drafts.count ? '配信すると生徒が取り組めます' : '未配信の課題はありません'} />
      <MetricCard label="要フォロー" value={escalations.count ?? 0} tone={escalations.count ? 'rose' : 'emerald'} note="対応を待っている記録の数" />
      <MetricCard label="今週の説明" value={weekAnswers.count ?? 0} tone="slate" note="直近7日に生徒が提出した数" />
      <MetricCard label="平均理解度" value={average === null ? '—' : `${average}%`} note={average === null ? 'データがたまると出ます' : `${scores.length}単元の最新評価`} />
    </div>

    <div className="mt-9 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel title="単元別理解度" description="直近100件から、生徒・単元ごとの最新評価を平均。先生が却下した評価は除きます。">
        {latestByConcept.size ? <div className="space-y-5">{[...latestByConcept.entries()].slice(0, 8).map(([conceptId, score]) => <div key={conceptId}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-[#34445f]">{conceptNames.get(conceptId) ?? '学習単元'}</span><span className="text-xs text-[#8a9ab2]">最新の評価</span></div><ScoreBar value={score} /></div>)}</div> : <EmptyState><span className="text-2xl text-[#c5d3e4]">▥</span><span className="mt-2 block">評価データが入ると単元ごとの傾向を表示します</span></EmptyState>}
      </Panel>
      <Panel title="要フォロー" action={<Link href="/teacher/interventions" className="text-xs font-bold text-[#237d75]">すべて見る　›</Link>}>
        {escalations.data?.length ? <div className="space-y-3">{escalations.data.map((item) => <Link key={item.id} href="/teacher/interventions" className="flex items-center justify-between gap-3 rounded-2xl border border-[#edf0f2] p-4 hover:border-[#b9dcd5]"><div><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-[#8a9ab2]">優先度: {item.priority}</p></div><StatusPill tone={item.priority === 'urgent' ? 'rose' : 'amber'}>{item.status === 'open' ? '未対応' : '確認中'}</StatusPill></Link>)}</div> : <EmptyState><span className="text-2xl text-[#c5d3e4]">♢</span><span className="mt-2 block">いま要フォローの生徒はいません</span></EmptyState>}
      </Panel>
    </div>
  </div>;
}
