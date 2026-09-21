'use client';
import Link from 'next/link';
import { usageFeature } from '@/lib/admin/usage-summary';
import { useEffect, useState } from 'react';
import { formatUsd, formatDateTime } from '@/lib/shared/format';
import type { summarizeUsage } from '@/lib/admin/usage-summary';

interface Usage { recent: Array<{ id: string; requestType: string; userName: string; model: string | null; costUsd: number; createdAt: string; status: string }>; budget: { limitUsd: number; spentUsd: number }; unpricedRuns: number; grouped: ReturnType<typeof summarizeUsage>; summary: { requests: number; costUsd: number; tokens: number }; truncated: boolean; updatedAt: string }
export function UsageMonitor() {
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
    <label className="text-sm font-bold">集計期間 <select value={days} onChange={e => { setDays(e.target.value); setData(null); }} className="ml-3 rounded-lg border p-2"><option value="1">直近24時間</option><option value="7">直近7日</option><option value="30">直近30日</option></select></label>
    <p className="mt-3 text-xs text-slate-500">10秒ごとに完了したAI呼び出しの記録を更新します。{data ? `最終更新: ${formatDateTime(data.updatedAt)}` : ''}</p>
    {error ? <p role="alert" className="mt-3 text-rose-700">{error}</p> : null}
    {data ? <><div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
      <p className="font-bold">所属全体の本日のAI予算：{formatUsd(data.budget.spentUsd)} / {formatUsd(data.budget.limitUsd)}</p>
      <progress aria-label="本日のAI予算の使用割合" value={data.budget.spentUsd} max={data.budget.limitUsd || 1} className="mt-2 w-full accent-emerald-700" />
      {data.budget.spentUsd >= data.budget.limitUsd * 0.8 ? <p className="mt-2 text-amber-900">{data.budget.spentUsd >= data.budget.limitUsd ? '本日の予算上限に達しました。AI呼び出しは停止しています。' : '本日の予算の80%以上を使用しています。'}</p> : null}
      <p className="mt-2 text-xs text-slate-600">所属単位の記録額です。OrcaRouterアカウントのクレジット残高ではありません。同時実行や未取得の費用により上限を超える場合があります。</p>
    </div><div className="my-5 grid gap-3 sm:grid-cols-3">{[['呼び出し', `${data.summary.requests}回`], ['入出力トークン', data.summary.tokens.toLocaleString()], ['記録された費用', formatUsd(data.summary.costUsd)]].map(([name, value]) => <div key={name} className="rounded-xl bg-white p-5"><p className="text-sm text-slate-500">{name}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    {data.unpricedRuns ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">費用を確認できない実行が{data.unpricedRuns}件あります。表示額に含まれていない費用があるため、OrcaRouter側でも確認してください。</p> : null}
    {data.truncated ? <p className="mb-3 text-amber-800">件数上限のため最新10,000件の集計です。期間を短くしてください。</p> : null}
    <div className="overflow-x-auto rounded-xl bg-white"><table className="w-full text-left text-sm"><thead><tr>{['利用者', '機能', '利用した場所', 'モデル', '回数', 'トークン', '費用', '代替', '要確認', '直近の利用'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{data.grouped.map(row => <tr key={JSON.stringify([row.userId, row.model, row.requestType])} className="border-t border-slate-100"><td className="p-3 font-bold">{row.userName}</td><td className="p-3">{row.feature}</td><td className="p-3 text-xs">{row.location}</td><td className="p-3 font-mono text-xs">{row.model}</td><td className="p-3">{row.requests}</td><td className="p-3">{row.tokens.toLocaleString()}</td><td className="p-3">{formatUsd(row.costUsd)}</td><td className="p-3">{row.fallbacks}</td><td className="p-3">{row.failures}</td><td className="whitespace-nowrap p-3">{formatDateTime(row.lastUsed)}</td></tr>)}</tbody></table>{!data.grouped.length ? <p className="p-6 text-slate-500">この期間の利用記録はありません。</p> : null}</div><details className="mt-5 rounded-xl bg-white p-4"><summary className="cursor-pointer font-bold">直近30件の実行履歴</summary><ul className="mt-3 divide-y">{data.recent.map(run => <li key={run.id} className="py-3 text-sm"><Link className="font-bold text-emerald-800 underline" href={`/teacher/ops/runs/${run.id}`}>{usageFeature(run.requestType).feature}</Link><p className="mt-1">{run.userName} ・ {formatDateTime(run.createdAt)} ・ {formatUsd(run.costUsd)}</p><p className="text-xs text-slate-500">{usageFeature(run.requestType).location} ・ {run.model ?? 'モデル未到達'} ・ {run.status}</p></li>)}</ul></details><p className="mt-3 text-xs text-slate-500">利用者・機能・モデルごとの実行記録を集計。費用は取得できた応答分の合計です。代替・修復前の費用も含み、行のモデル名は最終応答のモデルです。タイムアウト中の課金などは取得できず、請求確定額とは異なる場合があります。</p></> : <p className="mt-5">読み込み中…</p>}
  </div>;
}
