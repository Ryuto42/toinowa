'use client';

import { useState } from 'react';

interface Approval { id: string; resource_type: string; resource_id: string; requested_by: string; proposal: unknown; created_at: string }

export function ApprovalQueue({ initial }: { initial: Approval[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusy(id);
    const response = await fetch(`/api/approvals/${id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, rejectReason: decision === 'rejected' ? '先生が内容を確認して却下' : undefined }) });
    if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
    setBusy(null);
  }
  if (!items.length) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">確認待ちの提案はありません</div>;
  return <div className="space-y-4">{items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{item.resource_type}</p><p className="mt-1 font-bold">{item.requested_by} からの提案</p><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(item.proposal, null, 2)}</pre></div><div className="flex shrink-0 gap-2"><button disabled={busy === item.id} onClick={() => decide(item.id, 'rejected')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">却下</button><button disabled={busy === item.id} onClick={() => decide(item.id, 'approved')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">承認</button></div></div></article>)}</div>;
}
