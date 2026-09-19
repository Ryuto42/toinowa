'use client';

import { useState } from 'react';

interface Escalation { id: string; title: string; kind: string; priority: string; status: string; created_at: string; users?: { display_name?: string } | null }
export function InterventionList({ initial }: { initial: Escalation[] }) {
  const [items, setItems] = useState(initial);
  async function resolve(id: string) {
    const note = window.prompt('対応内容を入力してください') ?? '';
    const response = await fetch(`/api/escalations/${id}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'resolved', note }) });
    if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
  }
  return <div className="space-y-3">{items.map((item) => <article key={item.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : item.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-amber-50 text-amber-800'}`}>{item.priority}</span><span className="text-xs text-slate-500">{item.kind}</span></div><p className="mt-2 font-bold">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.users?.display_name ?? '対象生徒'}</p></div><button onClick={() => resolve(item.id)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">対応済みにする</button></article>)}</div>;
}
