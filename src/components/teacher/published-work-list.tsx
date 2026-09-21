'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

export interface PublishedWork {
  assignmentId: string;
  questionId: string | null;
  title: string;
  classroomName: string;
  targetName: string;
  status: string;
  dueAt: string | null;
  body: string;
  difficulty: number;
  content: string;
}

const DIFFICULTY_LABELS = ['用語と基本', '基本の説明', '概念の組み合わせ', '条件変更・応用', '初見の場面へ応用'];
const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

/** ISO文字列を <input type="datetime-local"> が読める「現地時刻」へ変換する。
 *  toISOString() を使うとUTCになり、表示が9時間ずれる。 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PublishedWorkList({ works }: { works: PublishedWork[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const headingId = useId();
  const [target, setTarget] = useState<PublishedWork | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [content, setContent] = useState('');
  const [difficulty, setDifficulty] = useState(2);
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  useEffect(() => () => restoreScroll(), []);

  function open(work: PublishedWork) {
    if (!work.questionId) return;
    setTarget(work);
    setTitle(work.title);
    setBody(work.body);
    setContent(work.content);
    setDifficulty(work.difficulty);
    setDueAt(toLocalInput(work.dueAt));
    setStatus('');
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.showModal();
  }

  function close() {
    if (busy) return;
    dialogRef.current?.close();
  }

  async function save(publish = false) {
    if (busy || !target) return;
    if (publish && !dueAt) { setStatus('公開するには期限を設定してください'); return; }
    setBusy(true);
    setStatus(publish ? '公開しています…' : '保存しています…');
    try {
      const response = await fetch(`/api/topics/${target.assignmentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title, body, content, difficulty,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          ...(publish ? { publish: true } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '保存できませんでした');
      dialogRef.current?.close();
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '通信に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="divide-y divide-slate-100">
      {works.map((work) => <div
        key={work.assignmentId}
        className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
      >
        <button
          type="button"
          onClick={() => open(work)}
          disabled={!work.questionId}
          aria-haspopup="dialog"
          className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <p className="font-bold">{work.title}</p>
          <p className="mt-1 text-sm text-slate-500">
            {work.classroomName} · {work.targetName} · Lv.{work.difficulty} · 期限 {formatDate(work.dueAt)}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <StatusPill tone={work.status === 'published' ? 'emerald' : work.status === 'draft' ? 'blue' : 'amber'}>
            {work.status === 'published' ? '公開中' : work.status === 'draft' ? '下書き' : work.status === 'completed' ? '完了' : work.status}
          </StatusPill>
          <button type="button" onClick={() => open(work)} disabled={!work.questionId}
            className="text-sm font-bold text-[#237d75] disabled:opacity-40">
            {work.status === 'draft' ? '確認して公開' : '編集'}
          </button>
          {work.status === 'draft' ? null : <Link href={`/teacher/works/${work.assignmentId}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700">
            分析を見る
          </Link>}
        </div>
      </div>)}
    </div>

    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onClose={() => { restoreScroll(); setTarget(null); }}
      onCancel={event => { if (busy) event.preventDefault(); }}
      onClick={event => {
        if (event.target !== event.currentTarget || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold">{target?.status === 'draft' ? 'AIの提案を確認して公開' : '説明ワークを編集'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {target ? `${target.classroomName} · ${target.targetName}` : ''}
          </p>
        </div>
        <button type="button" aria-label="編集を閉じる" disabled={busy} onClick={close}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 disabled:opacity-40">
          閉じる
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block text-sm font-bold">お題のタイトル
          <input disabled={busy} className={field} maxLength={200} value={title}
            onChange={event => setTitle(event.target.value)} />
        </label>
        <label className="block text-sm font-bold">お題の文面
          <textarea disabled={busy} className={field} rows={4} maxLength={4000} value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="生徒に説明してほしい問い" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">難易度
            <select disabled={busy} className={field} value={difficulty}
              onChange={event => setDifficulty(Number(event.target.value))}>
              {DIFFICULTY_LABELS.map((label, index) =>
                <option key={label} value={index + 1}>Lv.{index + 1} {label}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">宿題の期限
            <input type="datetime-local" disabled={busy} className={field} value={dueAt}
              onChange={event => setDueAt(event.target.value)} />
          </label>
        </div>
        <label className="block text-sm font-bold">AIが参考にする授業内容
          <textarea disabled={busy} className={field} rows={5} maxLength={20000} value={content}
            onChange={event => setContent(event.target.value)}
            placeholder="授業で扱った内容。AIが生徒の説明を評価するときの根拠になります。" />
        </label>
        <p className="text-xs text-slate-500">
          配信先のクラスと生徒は変更できません。別の相手に出す場合は新しく作成してください。
          {target?.status === 'draft' ? ' このお題は前回の説明をもとにAIが提案したものです。公開するまで生徒には表示されません。' : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save(target?.status === 'draft')}
            disabled={busy || !title.trim() || !body.trim()}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
            {target?.status === 'draft' ? '公開する' : '変更を保存'}
          </button>
          {target?.status === 'draft' ? <button type="button" onClick={() => save(false)}
            disabled={busy || !title.trim() || !body.trim()}
            className="rounded-xl border border-slate-300 px-5 py-3 font-bold transition hover:bg-slate-50 disabled:opacity-50">
            下書きのまま保存
          </button> : null}
          {status ? <span role="status" className="text-sm leading-7">{status}</span> : null}
        </div>
      </div>
    </dialog>
  </>;
}
