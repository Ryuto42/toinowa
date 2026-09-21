'use client';

import { FormEvent, useState } from 'react';

export function AssessmentOverride({ assessmentId, initialScore }: { assessmentId: string; initialScore: number | null }) {
  const [score, setScore] = useState(Math.round((initialScore ?? 0) * 100));
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus('保存中…');
    const response = await fetch(`/api/assessments/${assessmentId}/override`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score: score / 100, note }) });
    setStatus(response.ok ? '上書きを記録しました' : '保存できませんでした');
  }
  return <form onSubmit={submit} className="mt-5 space-y-3 rounded-xl bg-amber-50 p-4"><p className="text-sm font-bold text-amber-900">先生が評価を修正する</p>
    <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
      <label className="text-xs font-bold">評価（%）<input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-2"/></label>
      <label className="text-xs font-bold">修正の理由（生徒には見せません）<input required value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-2" placeholder="例：会話では説明できていたため"/></label>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-bold text-white">この内容で上書きする</button>
      {status ? <p role="status" className="text-xs text-amber-900">{status}</p> : null}
    </div></form>;
}
