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
  return <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl bg-amber-50 p-4 sm:grid-cols-[100px_1fr_auto]"><label className="text-xs font-bold">評価（%）<input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-amber-200 px-2 py-1"/></label><label className="text-xs font-bold">根拠<input required value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 px-2 py-1" placeholder="上書き理由"/></label><button className="self-end rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white">上書き</button>{status ? <p className="text-xs text-amber-900 sm:col-span-3">{status}</p> : null}</form>;
}
