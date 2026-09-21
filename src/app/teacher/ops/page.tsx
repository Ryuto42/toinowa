import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { EmptyState, MetricCard, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { ModelKillSwitch } from '@/components/teacher/model-kill-switch';
import { OpsAutoRefresh } from '@/components/teacher/ops-auto-refresh';
import { formatDateTime } from '@/lib/shared/format';
import { MODEL_TIER } from '@/lib/shared/env.server';
import { FALLBACK_CHAIN, PRIMARY } from '@/lib/orcarouter/routers';

const ROUTER_LABELS: Record<string, string> = {
  studentChat: '生徒との対話', assessment: '説明の評価', curriculum: '学習計画', safety: '安全性チェック',
};

const STATUS_LABELS: Record<string, string> = {
  ok: '成功', degraded: '縮退応答', blocked: '遮断', error: '失敗',
};

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

export default async function OpsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = adminDb();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const todayStart = new Date(new Date().toDateString()).toISOString();

  const [recentHour, today, feed, disabled, guards] = await Promise.all([
    db.from('agent_runs').select('status,latency_ms,fallback_count,resolved_model')
      .eq('tenant_id', context.tenantId).gte('created_at', since),
    db.from('agent_runs').select('estimated_cost_usd').eq('tenant_id', context.tenantId).gte('created_at', todayStart),
    db.from('agent_runs').select('id,agent_name,request_type,status,resolved_model,latency_ms,fallback_count,estimated_cost_usd,created_at')
      .eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(20),
    db.from('model_disables').select('model,reason').eq('tenant_id', context.tenantId).is('released_at', null),
    db.from('guard_events').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).gte('created_at', since),
  ]);

  const hour = recentHour.data ?? [];
  const p95 = percentile(hour.flatMap((run) => run.latency_ms === null ? [] : [run.latency_ms]), 0.95);
  const fallbacks = hour.filter((run) => run.fallback_count > 0).length;
  const cost = (today.data ?? []).reduce((sum, run) => sum + Number(run.estimated_cost_usd ?? 0), 0);
  const disabledModels = new Set((disabled.data ?? []).map((row) => row.model));

  // 設定上の主モデルと代替をそのまま並べる。画面と実際の挙動がずれないよう ROUTERS から引く。
  const tier = MODEL_TIER === 'production' ? 'production' : 'dev';
  const models = [...new Set([
    ...Object.values(PRIMARY[tier]),
    ...Object.values(FALLBACK_CHAIN[tier]).flat(),
  ])];

  return <div>
    <OpsAutoRefresh />
    <PageTitle
      title="AIの稼働状況"
      description="どのモデルが応答し、どこで切り替わり、いくらかかったかを確認します。10秒ごとに更新します。"
      action={<StatusPill tone={MODEL_TIER === 'production' ? 'rose' : 'amber'}>
        {MODEL_TIER === 'production' ? '本番モデル' : '開発モデル'}
      </StatusPill>}
    />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="直近1時間の呼び出し" value={hour.length} />
      <MetricCard label="応答時間 P95" value={p95 === null ? '—' : `${(p95 / 1000).toFixed(1)}秒`} />
      <MetricCard label="本日のAI費用" value={`$${cost.toFixed(4)}`} tone={cost > 0 ? 'amber' : 'emerald'} />
      <MetricCard label="代替モデルへの切替" value={fallbacks} tone={fallbacks ? 'amber' : 'slate'} />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <Panel title="モデルの稼働" description={context.role === 'admin' ? '停止すると、次の呼び出しから代替モデルへ切り替わります' : '停止・復帰の操作は管理者が行います'}>
        <ul className="space-y-3">
          {models.map((model) => {
            const off = disabledModels.has(model);
            const used = hour.filter((run) => run.resolved_model === model).length;
            return <li key={model} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3eaee] p-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-bold">{model}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {off ? '停止中' : '稼働中'} · 直近1時間 {used}件
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={off ? 'rose' : 'emerald'}>{off ? '停止' : '稼働'}</StatusPill>
                {context.role === 'admin' ? <ModelKillSwitch model={model} initiallyDisabled={off} /> : null}
              </div>
            </li>;
          })}
        </ul>
        <div className="mt-5 rounded-xl bg-[#f7faf9] p-3 text-xs leading-6 text-slate-600">
          <p className="font-bold">用途ごとの主モデル</p>
          <ul className="mt-1">
            {Object.entries(PRIMARY[tier]).map(([key, model]) => <li key={key}>
              {ROUTER_LABELS[key] ?? key}: <span className="font-mono">{model}</span>
            </li>)}
          </ul>
        </div>
      </Panel>

      <Panel title="直近のAI実行" description="行を選ぶと、そのリクエストの詳しい流れを開きます"
        action={<Link href="/teacher/ops/security" className="text-sm font-bold text-[#237d75]">
          安全性イベント{guards.count ? `（${guards.count}）` : ''} ›
        </Link>}>
        {feed.data?.length ? <div className="divide-y divide-slate-100">{feed.data.map((run) => <Link
          key={run.id} href={`/teacher/ops/runs/${run.id}`}
          className="flex items-center justify-between gap-4 py-3 first:pt-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{run.request_type}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{run.resolved_model ?? 'モデル不明'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            {run.fallback_count > 0 ? <StatusPill tone="amber">代替{run.fallback_count}回</StatusPill> : null}
            <StatusPill tone={run.status === 'ok' ? 'emerald' : run.status === 'degraded' ? 'amber' : 'rose'}>
              {STATUS_LABELS[run.status] ?? run.status}
            </StatusPill>
            <span className="w-14 text-right tabular-nums text-slate-500">{run.latency_ms ? `${(run.latency_ms / 1000).toFixed(1)}秒` : '—'}</span>
            <span className="hidden w-24 text-right text-slate-400 sm:block">{formatDateTime(run.created_at)}</span>
          </div>
        </Link>)}</div> : <EmptyState>まだAIの実行記録はありません</EmptyState>}
      </Panel>
    </div>
  </div>;
}
