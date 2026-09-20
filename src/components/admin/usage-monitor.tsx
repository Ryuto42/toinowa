'use client';
import { useEffect, useState } from 'react';
import { formatUsd, formatDateTime } from '@/lib/shared/format';
import type { summarizeUsage } from '@/lib/admin/usage-summary';

interface Usage { grouped: ReturnType<typeof summarizeUsage>; summary: { requests: number; costUsd: number; tokens: number }; truncated: boolean; updatedAt: string }
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
    {data ? <><div className="my-5 grid gap-3 sm:grid-cols-3">{[['呼び出し', `${data.summary.requests}回`], ['入出力トークン', data.summary.tokens.toLocaleString()], ['記録された費用', formatUsd(data.summary.costUsd)]].map(([name, value]) => <div key={name} className="rounded-xl bg-white p-5"><p className="text-sm text-slate-500">{name}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    {data.truncated ? <p className="mb-3 text-amber-800">件数上限のため最新10,000件の集計です。期間を短くしてください。</p> : null}
    <div className="overflow-x-auto rounded-xl bg-white"><table className="w-full text-left text-sm"><thead><tr>{['利用者', 'モデル', '回数', 'トークン', '費用', '代替', '要確認', '直近の利用'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{data.grouped.map(row => <tr key={JSON.stringify([row.userId, row.model])} className="border-t border-slate-100"><td className="p-3 font-bold">{row.userName}</td><td className="p-3 font-mono text-xs">{row.model}</td><td className="p-3">{row.requests}</td><td className="p-3">{row.tokens.toLocaleString()}</td><td className="p-3">{formatUsd(row.costUsd)}</td><td className="p-3">{row.fallbacks}</td><td className="p-3">{row.failures}</td><td className="whitespace-nowrap p-3">{formatDateTime(row.lastUsed)}</td></tr>)}</tbody></table>{!data.grouped.length ? <p className="p-6 text-slate-500">この期間の利用記録はありません。</p> : null}</div><p className="mt-3 text-xs text-slate-500">利用者・モデルごとの実行記録を集計。費用がAPIから返らない呼び出しは0として記録されるため、請求確定額とは異なる場合があります。</p></> : <p className="mt-5">読み込み中…</p>}
  </div>;
}
