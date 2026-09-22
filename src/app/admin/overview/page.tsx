import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { MetricCard, PageTitle, Panel, StatusPill } from '@/components/dashboard';

export default async function AdminOverviewPage() {
  const context = await requireRole('admin');
  const db = await createClient();
  const weekAgo = new Date(new Date().getTime() - 7 * 86_400_000).toISOString();
  const [weekAnswers, students, assignments, answers, assessments, escalations, runs, spend] = await Promise.all([
    db.from('answers').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).gte('answered_at', weekAgo),
    db.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('role', 'student').eq('status', 'active'),
    db.from('assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('status', 'published'),
    db.from('answers').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId),
    db.from('assessments').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId),
    db.from('escalations').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']),
    // agent_runs は authenticated 向けポリシーを持たない内部表。RLSクライアントでは常に0件になる。
    adminDb().from('agent_runs').select('id,status,agent_name,created_at').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(5),
    adminDb().rpc('today_ai_spend', { p_tenant: context.tenantId }),
  ]);
  for (const result of [weekAnswers, students, assignments, answers, assessments, escalations, runs, spend]) if (result.error) throw new Error(result.error.message);
  const todaySpend = Number(spend.data ?? 0);
  return <div>
    <PageTitle title="ダッシュボード" description="対応が必要なこと、AIの費用、学習の動きをまとめて確認します。" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="要フォロー" value={escalations.count ?? 0} tone={escalations.count ? 'rose' : 'emerald'} note={escalations.count ? '先生の対応を待っています' : '未対応の案件はありません'} />
      <MetricCard label="本日のAI費用" value={`$${todaySpend.toFixed(4)}`} tone="slate" note="上限に達すると自動で止まります" />
      <MetricCard label="今週の説明" value={weekAnswers.count ?? 0} tone="slate" note="直近7日に生徒が提出した数" />
      <MetricCard label="在籍生徒" value={students.count ?? 0} note={`公開中の課題 ${assignments.count ?? 0}件`} />
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="学習状況" description="生徒の課題と評価の蓄積です。">
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">説明数</p><p className="mt-1 text-2xl font-bold">{answers.count ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">AI分析数</p><p className="mt-1 text-2xl font-bold">{assessments.count ?? 0}</p></div></div>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/admin/students" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">生徒の学習状況を見る</Link><Link href="/admin/interventions" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">要フォローを見る</Link></div>
      </Panel>
      <Panel title="最近のAI実行" description="失敗やフォールバックを早く見つけるための直近5件です。">
        {runs.data?.length ? <div className="divide-y divide-slate-100">{runs.data.map((run) => <div key={run.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div><p className="font-bold">{run.agent_name}</p><p className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString('ja-JP')}</p></div><StatusPill tone={run.status === 'ok' ? 'emerald' : 'amber'}>{run.status}</StatusPill></div>)}</div> : <p className="text-sm text-slate-500">AI実行履歴はまだありません。</p>}
        <Link href="/admin/usage" className="mt-4 inline-block text-sm font-bold text-emerald-700 hover:underline">AI利用状況を詳しく見る →</Link>
      </Panel>
    </div>
  </div>;
}
