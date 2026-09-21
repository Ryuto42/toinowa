'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { REASON_LABELS } from './handoff-list';

/**
 * この生徒を別の先生へ引き継ぐ。
 *
 * 引き継ぎは「誰に」「なぜ」だけでは足りず、受け取った先生が
 * 最初の1回をどう進めればいいかが要る。申し送りを必須にしてある。
 */
export function HandoffForm({ studentId, teachers }: {
  studentId: string;
  teachers: { id: string; display_name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toUser, setToUser] = useState('');
  const [reason, setReason] = useState('class_change');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!toUser || !note.trim()) { setError('引き継ぎ先と申し送りを入力してください。'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/handoffs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studentId, toUser, reason, note }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        setError(body?.message ?? '引き継ぎを作成できませんでした。');
        return;
      }
      setOpen(false); setToUser(''); setNote('');
      router.refresh();
    } catch {
      setError('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  // 候補が居ないときに黙って消えると、機能ごと無くなったように見える。
  // 押せない理由まで出す。
  if (!teachers.length) {
    return <p className="text-sm text-slate-500">
      引き継ぎ先の先生がまだ登録されていません。管理者に先生の追加を依頼してください。
    </p>;
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-400">
      別の先生へ引き継ぐ
    </button>;
  }

  // 見出しの右に置いているので、開いたときは幅を決めて折り返させる。
  // 全幅にすると見出しを押し出し、狭いままだと入力欄が読めない。
  return <form onSubmit={submit}
    className="w-[34rem] max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_18px_40px_-28px_rgba(23,35,61,0.45)]">
    <p className="font-bold">別の先生へ引き継ぐ</p>
    <p className="mt-1 text-sm text-slate-500">
      いまの理解度・つまずき・要フォローの項目を添えて送ります。相手が引き受けると記録に残ります。
    </p>
    {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">
        引き継ぎ先の先生
        <select value={toUser} onChange={(event) => setToUser(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal">
          <option value="">選んでください</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.display_name}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">
        引き継ぐ理由
        <select value={reason} onChange={(event) => setReason(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal">
          {Object.entries(REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <label className="mt-4 block text-sm font-semibold text-slate-700">
      申し送り
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={4000}
        placeholder="次の先生に伝えたいこと（つまずいている点、声のかけ方、家庭の事情など）"
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal leading-6" />
    </label>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="submit" disabled={busy}
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
        {busy ? '送信中…' : '引き継ぎを送る'}
      </button>
      <button type="button" onClick={() => setOpen(false)}
        className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600">
        やめる
      </button>
    </div>
  </form>;
}
