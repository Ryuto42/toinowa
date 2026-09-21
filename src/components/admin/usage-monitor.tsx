'use client';
import Link from 'next/link';
import { usageFeature } from '@/lib/admin/usage-summary';
import { useEffect, useState } from 'react';
import { formatUsd, formatDateTime } from '@/lib/shared/format';
import { DataTable } from '@/components/data-table';
import type { summarizeUsage } from '@/lib/admin/usage-summary';

interface Usage { recent: Array<{ id: string; requestType: string; userName: string; model: string | null; costUsd: number; createdAt: string; status: string }>; budget: { limitUsd: number; spentUsd: number }; unpricedRuns: number; estimatedRuns: number; grouped: ReturnType<typeof summarizeUsage>; summary: { requests: number; costUsd: number; tokens: number; inputTokens: number; cachedTokens: number }; truncated: boolean; updatedAt: string }

/** 本日の予算の使用割合。バーだと残りが読み取りにくいので、円で「残り」を面で見せる。 */
function BudgetDonut({ spent, limit }: { spent: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const size = 96;
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = spent >= limit ? { stroke: '#b34e5b', text: 'text-[#8f3b46]' }
    : spent >= limit * 0.8 ? { stroke: '#c08422', text: 'text-[#8a5e12]' }
    : { stroke: '#238878', text: 'text-[#1c6e60]' };
  return <div className="flex items-center gap-4">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`本日のAI予算 ${formatUsd(spent)} / ${formatUsd(limit)}（${Math.round(ratio * 100)}%）`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e7efee" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tone.stroke} strokeWidth={10}
        strokeLinecap="round" strokeDasharray={`${circumference * ratio} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="46%" textAnchor="middle" className={`fill-current text-base font-bold ${tone.text}`}>
        {Math.round(ratio * 100)}%
      </text>
      <text x="50%" y="64%" textAnchor="middle" className="fill-current text-[9px] text-slate-500">使用</text>
    </svg>
    <div className="min-w-0">
      <p className="text-sm text-slate-500">本日の使用額</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums">{formatUsd(spent)}</p>
      <p className="mt-0.5 text-xs text-slate-500">上限 {formatUsd(limit)} · 残り {formatUsd(Math.max(limit - spent, 0))}</p>
      <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">この金額について</summary>
        <p className="mt-1 leading-6">所属単位の記録額です。OrcaRouterアカウントのクレジット残高ではありません。同時実行や未取得の費用により上限を超える場合があります。</p>
      </details>
    </div>
  </div>;
}

export function UsageMonitor({ modelStatus }: { modelStatus?: React.ReactNode }) {
  const [days, setDays] = useState('1');
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`/api/admin/usage?days=${days}`);
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!stopped) { setData(result); setError(''); }
      } catch { if (!stopped) setError('利用状況を取得できませんでした。再接続を試みます。'); }
      if (!stopped) timer = setTimeout(refresh, 10000);
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [days]);
  return <div>
    <div className="grid gap-4 lg:grid-cols-2">
      {modelStatus}
      <div className="h-full rounded-2xl border border-[#e3eaee] bg-white p-5">
        <p className="font-bold">所属全体の本日のAI予算</p>
        {data ? <>
          <div className="mt-3"><BudgetDonut spent={data.budget.spentUsd} limit={data.budget.limitUsd} /></div>
          {data.budget.spentUsd >= data.budget.limitUsd * 0.8 ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {data.budget.spentUsd >= data.budget.limitUsd ? '本日の予算上限に達しました。AI呼び出しは停止しています。' : '本日の予算の80%以上を使用しています。'}
          </p> : null}
        </> : <p className="mt-3 text-sm text-slate-500">読み込み中…</p>}
      </div>
    </div>

    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="text-sm font-bold">集計期間 <select value={days} onChange={e => { setDays(e.target.value); setData(null); }} className="ml-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="1">直近24時間</option><option value="7">直近7日</option><option value="30">直近30日</option></select></label>
      <p className="text-xs text-slate-500">10秒ごとに更新{data ? ` · 最終更新 ${formatDateTime(data.updatedAt)}` : ''}</p>
    </div>
    {error ? <p role="alert" className="mt-3 text-rose-700">{error}</p> : null}
    {data ? <><div className="mt-4 mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['呼び出し', `${data.summary.requests}回`], ['入出力トークン', data.summary.tokens.toLocaleString()], ['記録された費用', formatUsd(data.summary.costUsd)], ['キャッシュ再利用', data.summary.inputTokens ? `${Math.round((data.summary.cachedTokens / data.summary.inputTokens) * 100)}%` : '—']].map(([name, value]) => <div key={name} className="rounded-xl bg-white p-5"><p className="text-sm text-slate-500">{name}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    {data.unpricedRuns ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">費用を確認できない実行が{data.unpricedRuns}件あります。表示額に含まれていない費用があるため、OrcaRouter側でも確認してください。</p> : null}
    {data.truncated ? <p className="mb-3 text-amber-800">件数上限のため最新10,000件の集計です。期間を短くしてください。</p> : null}
    <div className="rounded-xl bg-white p-4"><DataTable
      rows={data.grouped}
      getKey={row => JSON.stringify([row.userId, row.model, row.requestType])}
      searchIn={row => `${row.userName} ${row.feature} ${row.location} ${row.model ?? ''}`}
      searchPlaceholder="利用者・機能・モデルで検索"
      empty="この期間の利用記録はありません。"
      initialSort={{ key: 'lastUsed', direction: 'desc' }}
      filters={[
        { key: 'user', label: '利用者', options: [...new Set(data.grouped.map(row => row.userName))].sort((a, b) => a.localeCompare(b, 'ja')).map(name => ({ value: name, label: name })), match: (row, value) => row.userName === value },
        { key: 'feature', label: '機能', options: [...new Set(data.grouped.map(row => row.feature))].sort((a, b) => a.localeCompare(b, 'ja')).map(name => ({ value: name, label: name })), match: (row, value) => row.feature === value },
        { key: 'model', label: 'モデル', options: [...new Set(data.grouped.map(row => row.model).filter((model): model is string => Boolean(model)))].sort().map(model => ({ value: model, label: model })), match: (row, value) => row.model === value },
      ]}
      columns={[
        { key: 'user', label: '利用者', sortBy: row => row.userName, render: row => <span className="font-bold">{row.userName}</span> },
        { key: 'feature', label: '機能', sortBy: row => row.feature, render: row => row.feature },
        { key: 'location', label: '利用した場所', hideOnMobile: true, sortBy: row => row.location, render: row => <span className="text-xs">{row.location}</span> },
        { key: 'model', label: 'モデル', hideOnMobile: true, sortBy: row => row.model, render: row => <span className="font-mono text-xs">{row.model}</span> },
        { key: 'requests', label: '回数', align: 'right', sortBy: row => row.requests, render: row => row.requests },
        { key: 'tokens', label: 'トークン', align: 'right', hideOnMobile: true, sortBy: row => row.tokens, render: row => row.tokens.toLocaleString() },
        { key: 'cost', label: '費用', align: 'right', sortBy: row => row.costUsd, render: row => formatUsd(row.costUsd) },
        { key: 'fallbacks', label: '代替', align: 'right', hideOnMobile: true, sortBy: row => row.fallbacks, render: row => row.fallbacks },
        { key: 'failures', label: '要確認', align: 'right', hideOnMobile: true, sortBy: row => row.failures, render: row => row.failures },
        { key: 'lastUsed', label: '直近の利用', align: 'right', sortBy: row => row.lastUsed, render: row => <span className="whitespace-nowrap">{formatDateTime(row.lastUsed)}</span> },
      ]}
    /></div><details className="mt-5 rounded-xl bg-white p-4"><summary className="cursor-pointer font-bold">直近30件の実行履歴</summary><ul className="mt-3 divide-y">{data.recent.map(run => <li key={run.id} className="py-3 text-sm"><Link className="font-bold text-emerald-800 underline" href={`/admin/usage/runs/${run.id}`}>{usageFeature(run.requestType).feature}</Link><p className="mt-1">{run.userName} ・ {formatDateTime(run.createdAt)} ・ {formatUsd(run.costUsd)}</p><p className="text-xs text-slate-500">{usageFeature(run.requestType).location} ・ {run.model ?? 'モデル未到達'} ・ {run.status}</p></li>)}</ul></details><p className="mt-3 text-xs text-slate-500">利用者・機能・モデルごとの実行記録を集計。費用は取得できた応答分の合計に、ゲートウェイが金額を返さない応答（音声入力など）のカタログ単価からの推定を加えた額です。代替・修復前の費用も含み、行のモデル名は最終応答のモデルです。タイムアウト中の課金などは取得できず、請求確定額とは異なる場合があります。</p></> : <p className="mt-5">読み込み中…</p>}
  </div>;
}
