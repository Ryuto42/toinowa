'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function AssessmentOverride({ assessmentId, initialScore, pendingReview }: { assessmentId: string; initialScore: number | null; pendingReview: boolean }) {
  const router = useRouter();
  const [score, setScore] = useState(Math.round((initialScore ?? 0) * 100));
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  async function send(body: unknown, done: string) {
    setSaving(true); setStatus('保存中…');
    const response = await fetch(`/api/assessments/${assessmentId}/override`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false); setStatus(response.ok ? done : '保存できませんでした');
    if (response.ok) router.refresh();
  }
  return <div className="mt-5 space-y-3">
    {/* 内容に納得できたらそのまま確定できる。確定するまで生徒には結果が返らない。 */}
    {pendingReview ? <div className="rounded-xl border border-[#e3eaee] p-4">
      <p className="text-sm font-bold text-[#17233d]">根拠を読んで問題がなければ</p>
      <p className="mt-1 text-xs leading-6 text-[#60708d]">確定すると、生徒の「学習の振り返り」にこの回のふり返りが表示されます。</p>
      <button type="button" disabled={saving} onClick={() => void send({ action: 'approve' }, 'この評価を確定しました')}
        className="mt-3 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">この内容で確定する</button>
    </div> : null}
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); void send({ score: score / 100, note }, '上書きを記録しました'); }} className="space-y-3 rounded-xl bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-900">先生が評価を修正する</p>
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
        <label className="text-xs font-bold">評価（%）<input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-2"/></label>
        <label className="text-xs font-bold">修正の理由（生徒には見せません）<input required value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-2" placeholder="例：会話では説明できていたため"/></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={saving} className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">この内容で上書きする</button>
        {status ? <p role="status" className="text-xs text-amber-900">{status}</p> : null}
      </div>
    </form>
  </div>;
}
