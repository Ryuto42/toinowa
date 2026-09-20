'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Approval {
  id: string; resource_type: string; resource_id: string; requested_by: string;
  proposal: unknown; created_at: string;
  studentId?: string | null; targetName?: string; classroomName?: string; rationale?: string;
}

function proposalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function ApprovalQueue({ initial }: { initial: Approval[] }) {
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [dueDates, setDueDates] = useState<Record<string, string>>({});
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(id: string, decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && !reasons[id]?.trim()) { setError('却下する理由を入力してください。'); return; }
    setBusy(id); setError('');
    try {
      const response = await fetch(`/api/approvals/${id}/decision`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, ...(dueDates[id] ? { dueAt: new Date(dueDates[id]).toISOString() } : {}), rejectReason: decision === 'rejected' ? reasons[id].trim() : undefined }),
      });
      if (response.ok) setItems(current => current.filter(item => item.id !== id));
      else { const body = await response.json(); setError(body.message ?? '承認を保存できませんでした'); }
    } catch { setError('通信に失敗しました'); } finally { setBusy(null); }
  }
  if (!items.length) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">確認待ちの提案はありません</div>;
  return <div className="space-y-4">
    {error ? <p role="alert" className="text-rose-700">{error}</p> : null}
    {items.map(item => {
      const proposal = proposalRecord(item.proposal);
      const homework = item.resource_type === 'assignment';
      return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-emerald-700">{homework ? '次の宿題候補' : item.resource_type === 'assessment' ? '評価の確認' : '学習の提案'}</p>
            <p className="mt-2 font-bold">対象：{item.targetName || '対象を確認してください'}{item.classroomName ? `（${item.classroomName}）` : ''}</p>
            {item.studentId ? <Link href={`/teacher/students/${item.studentId}`} className="mt-1 inline-block text-sm text-emerald-700 underline">生徒の評価・学習計画を確認</Link> : null}
            {homework ? <div className="mt-3 rounded-lg bg-slate-50 p-4">
              <p className="font-bold">{String(proposal.title ?? '宿題')}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{String(proposal.body ?? '')}</p>
              <p className="mt-2 text-xs text-slate-500">難易度 Lv.{String(proposal.difficulty ?? '—')}</p>
            </div> : <p className="mt-3 text-sm text-slate-600">生徒の詳細画面で分析の根拠を確認してから、承認または評価を修正してください。</p>}
            {item.rationale ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">この宿題を提案した理由</summary><p className="mt-2 whitespace-pre-wrap leading-7 text-slate-600">{item.rationale}</p></details> : null}
          </div>
          <div className="shrink-0 space-y-3">
            {homework ? <label className="block text-sm">宿題の期限<input aria-label="宿題の期限" type="datetime-local" value={dueDates[item.id] ?? ''} onChange={event => setDueDates(current => ({ ...current, [item.id]: event.target.value }))} className="mt-1 block rounded-lg border p-2" /></label> : null}
            <label className="block text-sm">却下する場合の理由<textarea aria-label="却下理由" maxLength={2000} value={reasons[item.id] ?? ''} onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))} placeholder="例：まだ授業で扱っていないため" className="mt-1 block w-full rounded-lg border p-2" rows={2} /></label>
            <div className="flex gap-2">
              <button disabled={busy !== null} onClick={() => decide(item.id, 'rejected')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">却下</button>
              <button disabled={busy !== null || (homework && !dueDates[item.id])} onClick={() => decide(item.id, 'approved')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{homework ? '確認して配信' : '承認'}</button>
            </div>
          </div>
        </div>
      </article>;
    })}
  </div>;
}
