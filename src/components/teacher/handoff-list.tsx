'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';

export interface HandoffRow {
  id: string;
  student_id: string;
  from_user: string;
  to_user: string;
  reason: string;
  note: string;
  status: string;
  snapshot: unknown;
  created_at: string;
  responded_at?: string | null;
  response_note?: string | null;
}

export const REASON_LABELS: Record<string, string> = {
  class_change: '担当替え', substitute: '代講', promotion: '進級・クラス変更',
  consult: '相談したい', other: 'その他',
};
export const STATUS_LABELS: Record<string, string> = {
  pending: '受け取り待ち', accepted: '引き継ぎ済み', declined: '見送り', cancelled: '取り下げ',
};
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800', accepted: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-slate-100 text-slate-600', cancelled: 'bg-slate-100 text-slate-600',
};

interface Snapshot {
  averageScore?: number | null;
  misconceptions?: string[];
  openInterventions?: string[];
  works?: { completed?: number; inProgress?: number; notStarted?: number };
  capturedAt?: string;
}
function asSnapshot(value: unknown): Snapshot {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Snapshot : {};
}

/**
 * 引き継ぎの一覧。
 *
 * `mode` は「自分が受け取る側か、送った側か、管理者として全部見ているか」。
 * 出せるボタンが変わるだけで、中身の見せ方は同じにしてある。
 */
export function HandoffList({ initial, mode, names, linkStudents = true, studentBase = '/teacher/students' }: {
  initial: HandoffRow[];
  mode: 'inbox' | 'outbox' | 'admin';
  names: Record<string, string>;
  linkStudents?: boolean;
  /** 生徒の記録へのリンク先。管理者は /admin/students を見る。 */
  studentBase?: string;
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function respond(id: string, decision: 'accepted' | 'declined' | 'cancelled') {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/api/handoffs/${id}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) { setError('保存できませんでした。時間をおいてもう一度お試しください。'); return; }
      setItems((current) => current.map((item) => item.id === id
        ? { ...item, status: decision, responded_at: new Date().toISOString() } : item));
    } catch {
      setError('通信に失敗しました。');
    } finally {
      setBusy(null);
    }
  }

  return <div>
    {error ? <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <DataTable
      rows={items}
      getKey={(item) => item.id}
      searchIn={(item) => `${names[item.student_id] ?? ''} ${names[item.from_user] ?? ''} ${names[item.to_user] ?? ''} ${item.note}`}
      searchPlaceholder="生徒名・先生名・申し送りで検索"
      empty="該当する引き継ぎはありません"
      initialSort={{ key: 'created', direction: 'desc' }}
      filters={[
        { key: 'status', label: '状態', options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })), match: (item, value) => item.status === value },
        { key: 'reason', label: '理由', options: Object.entries(REASON_LABELS).map(([value, label]) => ({ value, label })), match: (item, value) => item.reason === value },
      ]}
      columns={[
        { key: 'created', label: '作成日時', sortBy: (item) => item.created_at, render: () => null },
        { key: 'student', label: '生徒名', sortBy: (item) => names[item.student_id] ?? null, render: () => null },
        { key: 'status', label: '状態', sortBy: (item) => STATUS_LABELS[item.status] ?? item.status, render: () => null },
      ]}
      renderCard={(item) => {
      const snapshot = asSnapshot(item.snapshot);
      const studentName = names[item.student_id] ?? '生徒';
      const pending = item.status === 'pending';
      return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[item.status] ?? 'bg-slate-100 text-slate-600'}`}>
                {STATUS_LABELS[item.status] ?? item.status}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {REASON_LABELS[item.reason] ?? item.reason}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(item.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="mt-2 font-bold">
              {linkStudents
                ? <Link href={`${studentBase}/${item.student_id}`} className="text-[#237d75] underline">{studentName}</Link>
                : studentName}
              <span className="ml-2 text-sm font-normal text-slate-500">
                {names[item.from_user] ?? '先生'} → {names[item.to_user] ?? '先生'}
              </span>
            </p>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{item.note}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {pending && mode === 'inbox' ? <>
              <button type="button" disabled={busy === item.id} onClick={() => respond(item.id, 'accepted')}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                引き受ける
              </button>
              <button type="button" disabled={busy === item.id} onClick={() => respond(item.id, 'declined')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-50">
                見送る
              </button>
            </> : null}
            {pending && mode === 'outbox' ? <button type="button" disabled={busy === item.id}
              onClick={() => respond(item.id, 'cancelled')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-50">
              取り下げる
            </button> : null}
          </div>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#237d75]">引き継いだ時点の様子</summary>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">その時点の理解度</dt>
              <dd className="font-bold tabular-nums">
                {typeof snapshot.averageScore === 'number' ? `${Math.round(snapshot.averageScore * 100)}点` : '評価なし'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">課題</dt>
              <dd className="font-bold tabular-nums">
                完了 {snapshot.works?.completed ?? 0} / 取り組み中 {snapshot.works?.inProgress ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">要フォロー</dt>
              <dd className="font-bold tabular-nums">{snapshot.openInterventions?.length ?? 0}件</dd>
            </div>
          </dl>
          {snapshot.misconceptions?.length ? <div className="mt-3">
            <p className="text-sm font-bold text-slate-700">その時点で残っていたつまずき</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {snapshot.misconceptions.map((label) => <li key={label}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{label}</li>)}
            </ul>
          </div> : null}
          {snapshot.openInterventions?.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
            {snapshot.openInterventions.map((title) => <li key={title}>{title}</li>)}
          </ul> : null}
          <p className="mt-3 text-xs text-slate-500">
            引き継いだ時点の記録です。いまの状況は生徒のページで確認してください。
          </p>
        </details>

        {item.response_note ? <p className="mt-3 text-sm text-slate-600">返信: {item.response_note}</p> : null}
      </article>;
    }}
    />
  </div>;
}
