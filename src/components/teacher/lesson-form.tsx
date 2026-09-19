'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LessonForm({ classrooms }: { classrooms: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/lessons', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ classroomId: form.get('classroomId'), title: form.get('title'), taughtAt: form.get('taughtAt') || undefined, objectives: String(form.get('objectives') ?? '').split('\n').map((v) => v.trim()).filter(Boolean) }) });
    if (!response.ok) { setError('授業を登録できませんでした'); setBusy(false); return; }
    setOpen(false); setBusy(false); router.refresh();
  }
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">授業を登録</button>;
  return <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">授業を登録</h2><button type="button" onClick={() => setOpen(false)} className="text-slate-500">閉じる</button></div><label className="mt-5 block text-sm font-bold">対象クラス<select required name="classroomId" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="mt-4 block text-sm font-bold">授業名<input required name="title" maxLength={200} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"/></label><label className="mt-4 block text-sm font-bold">実施日<input name="taughtAt" type="date" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"/></label><label className="mt-4 block text-sm font-bold">学習目標（1行に1つ）<textarea name="objectives" rows={4} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"/></label>{error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}<button disabled={busy} className="mt-5 w-full rounded-xl bg-emerald-700 py-2.5 font-bold text-white disabled:opacity-50">{busy ? '登録中…' : '登録する'}</button></form></div>;
}
