'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ExamAnalysisResult } from '@/lib/materials/exam-analysis';
export function ExamReview({ id, initial, reasons, images, completed }: { id: string; initial: ExamAnalysisResult; reasons: string[]; images: string[]; completed: boolean }) {
  const [result, setResult] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(completed);
  const [message, setMessage] = useState('');
  const [zoomed, setZoomed] = useState(false);
  const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm';
  async function approve() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/exam-analyses/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true, result }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? '反映できませんでした');
      setDone(true); setMessage('確認済みの結果を保存しました。登録済みの生徒には、手入力の変更を保持して反映します。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '反映できませんでした。再度お試しください。'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    {!done ? <>
      <section className="rounded-2xl bg-amber-50 p-5"><h2 className="font-bold">確認が必要な箇所</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul><p className="mt-3 text-sm">元資料で確認し、下の成績・提案を修正してください。不明な値は追加する必要はありません。</p></section>
      <div className="grid items-start gap-6 lg:grid-cols-2"><section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold">アップロードした資料</h2>
        <button type="button" onClick={() => setZoomed(!zoomed)} className="mb-3 text-sm font-bold text-emerald-800 underline">{zoomed ? '資料を全体表示する' : '資料を拡大する'}</button>
        {images.map((src, index) => <details key={index} open={index === 0} className="mb-4"><summary className="cursor-pointer py-2 font-semibold">{index + 1}ページ目</summary><div className="max-h-[75dvh] overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`確認用の模試資料 ${index + 1}ページ`} className={zoomed ? 'h-auto w-[1600px] max-w-none' : 'h-auto w-full'} />
        </div></details>)}
      </section><form className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5" onSubmit={event => { event.preventDefault(); if (confirmed) void approve(); }}>
        <label className="block text-sm font-bold">成績の読み取り結果<textarea aria-label="成績の読み取り結果" required maxLength={20000} rows={Math.min(14, Math.max(6, result.text.split('\n').length + 2))} value={result.text} onChange={e => setResult({ ...result, text: e.target.value })} className={field} /></label>
        <label className="block text-sm font-bold">学習目標の提案（任意）<textarea maxLength={2000} rows={3} value={result.learningGoal} onChange={e => setResult({ ...result, learningGoal: e.target.value })} className={field} /></label>
        <label className="block text-sm font-bold">復習する範囲の提案（任意）<textarea maxLength={4000} rows={3} value={result.weakAreas} onChange={e => setResult({ ...result, weakAreas: e.target.value })} className={field} /></label>
        <label className="block text-sm font-bold">1日の学習時間の提案（分・任意）<input type="number" min={5} max={120} value={result.dailyTimeLimitMin ?? ''} onChange={e => setResult({ ...result, dailyTimeLimitMin: e.target.value ? Number(e.target.value) : null })} className={field} /></label>
        <p className="text-xs leading-6 text-slate-600">{result.rationale}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />元資料と照合し、成績の種類・数値と提案内容を確認しました</label>
        <button disabled={!confirmed || busy} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? '保存中…' : '確認した内容を反映する'}</button>
      </form></div>
    </> : <section className="rounded-2xl bg-emerald-50 p-5"><p>確認済みです。原画像は確認後に削除しました。</p><button onClick={() => void approve()} disabled={busy} className="mt-3 text-sm font-bold text-emerald-800 underline">生徒への反映を再試行する</button></section>}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    <Link href="/admin/users" className="inline-block font-bold text-emerald-800 underline">ユーザー管理へ戻る</Link>
  </div>;
}
