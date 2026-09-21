'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { StatusPill } from '@/components/dashboard';
import { formatDateTime } from '@/lib/shared/format';

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
  revision: number;
  rationale?: string;
  minutes?: number;
  reviewNotes?: string[];
  studentId?: string | null;
  sourceLabel?: string;
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
  const [selected, setSelected] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState('');
  const [refreshTokens, setRefreshTokens] = useState<string[]>([]);
  const refreshing = works.some(work => refreshTokens.includes(`${work.assignmentId}:${work.revision}`));

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
    document.body.style.setProperty('overflow', 'hidden');
    dialogRef.current?.showModal();
  }

  function close() {
    if (busy) return;
    dialogRef.current?.close();
  }

  async function save(publish = false) {
    if (busy || refreshing || !target) return;
    if (publish && !dueAt) { setStatus('公開するには期限を設定してください'); return; }
    setBusy(true);
    setStatus(publish ? '公開しています…' : '保存しています…');
    try {
      const response = await fetch('/api/topics/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publish, items: [{ id: target.assignmentId, revision: target.revision, title, body, content, difficulty,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null }],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '保存できませんでした');
      setRefreshTokens([`${target.assignmentId}:${target.revision}`]);
      dialogRef.current?.close();
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '通信に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  const chosen = works.filter(work => work.status === 'draft' && selected.includes(`${work.assignmentId}:${work.revision}`));
  async function publishSelected() {
    if (busy || refreshing || !chosen.length) return;
    setBusy(true); setBatchStatus('確認した課題を配信しています…');
    try {
      const response = await fetch('/api/topics/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publish: true, items: chosen.map(work => ({ id: work.assignmentId, revision: work.revision, title: work.title, body: work.body, content: work.content, difficulty: work.difficulty, dueAt: work.dueAt ? new Date(work.dueAt).toISOString() : null })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '配信できませんでした');
      setRefreshTokens(chosen.map(work => `${work.assignmentId}:${work.revision}`));
      setSelected([]); setBatchStatus(`${result.count}件を承認して配信しました。`); router.refresh();
    } catch(error) { setBatchStatus(error instanceof Error ? error.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }

  return <>
    {refreshing ? <p role="status" className="mb-3 text-sm text-emerald-800">保存した内容を表示に反映しています… <button type="button" onClick={() => router.refresh()} className="underline">表示を再取得</button></p> : null}
    {works.some(work => work.status === 'draft') ? <div className="mb-5 rounded-xl bg-emerald-50 p-4">
      <p className="text-sm leading-7 text-emerald-950">お題・提案理由・期限を確認し、問題がない課題にチェックを入れてください。必要な課題だけ編集できます。</p>
      <button type="button" disabled={busy || refreshing || !chosen.length} onClick={publishSelected} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">確認した{chosen.length}件を承認して配信</button>
      {batchStatus ? <p role="status" className="mt-2 text-sm">{batchStatus}</p> : null}
    </div> : null}
    <div className="divide-y divide-slate-100">
      {works.map((work) => <div
        key={work.assignmentId}
        className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1"><button
          type="button"
          onClick={() => open(work)}
          disabled={busy || refreshing || !work.questionId}
          aria-haspopup="dialog"
          className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <p className="font-bold">{work.title}</p>
          <p className="mt-1 text-sm text-slate-500">
            {work.classroomName} · {work.targetName} · Lv.{work.difficulty} · 期限 {formatDateTime(work.dueAt)}
          </p>
        </button>
        {work.status === 'draft' ? <div className="mt-3 space-y-3 px-1 text-sm leading-7">
          <p className="whitespace-pre-wrap font-medium text-slate-800">{work.body}</p>
          <p className="text-xs text-slate-500">{work.sourceLabel ?? 'AIからの課題案'}{work.minutes ? ` · 目安 ${work.minutes}分` : ''}</p>
          {work.rationale ? <div className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-slate-700">この課題を選んだ理由・計画の変更</p>{work.revision > 0 ? <p className="mt-1 text-xs text-slate-500">先生が編集済みです。以下はAIが最初に提案したときの理由です。</p> : null}<p className="mt-1 whitespace-pre-wrap text-slate-600">{work.rationale}</p></div> : null}
          {work.reviewNotes?.length ? <ul className="list-disc rounded-xl bg-amber-50 py-3 pl-7 pr-3 text-amber-900">{work.reviewNotes.map((note,index) => <li key={index}>{note}</li>)}</ul> : null}
          {work.studentId ? <Link href={`/teacher/students/${work.studentId}#learning-plan`} className="inline-block font-bold text-emerald-800 underline">根拠となる評価と学習計画を見る</Link> : null}
          <label className="flex items-center gap-2 font-bold text-emerald-900"><input type="checkbox" disabled={busy || refreshing || !work.dueAt || !work.questionId} checked={selected.includes(`${work.assignmentId}:${work.revision}`)} onChange={event => { const key = `${work.assignmentId}:${work.revision}`; setSelected(values => event.target.checked ? [...values,key] : values.filter(value => value !== key)); }} className="h-4 w-4 accent-emerald-700" />内容・期限を確認しました{!work.dueAt ? '（先に期限を設定してください）' : ''}</label>
        </div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusPill tone={work.status === 'published' ? 'emerald' : work.status === 'draft' ? 'blue' : 'amber'}>
            {work.status === 'published' ? '公開中' : work.status === 'draft' ? '先生の確認待ち' : work.status === 'completed' ? '完了' : work.status}
          </StatusPill>
          <button type="button" onClick={() => open(work)} disabled={busy || refreshing || !work.questionId}
            className="text-sm font-bold text-[#237d75] disabled:opacity-40">
            {work.status === 'draft' ? '確認・編集' : '編集'}
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
          <h2 id={headingId} className="text-xl font-bold">{target?.status === 'draft' ? 'AIの提案を確認して配信' : '説明ワークを編集'}</h2>
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
          <textarea aria-label="お題の文面" disabled={busy} className={field} rows={4} maxLength={4000} value={body}
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
          <textarea aria-label="AIが参考にする授業内容" disabled={busy} className={field} rows={5} maxLength={20000} value={content}
            onChange={event => setContent(event.target.value)}
            placeholder="授業で扱った内容。AIが生徒の説明を評価するときの根拠になります。" />
        </label>
        <p className="text-xs text-slate-500">
          配信先のクラスと生徒は変更できません。別の相手に出す場合は新しく作成してください。
          {target?.status === 'draft' ? ' このお題はAIの提案です。承認して配信するまで生徒には表示されません。' : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save(target?.status === 'draft')}
            disabled={busy || !title.trim() || !body.trim()}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
            {target?.status === 'draft' ? '承認して配信' : '変更を保存'}
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
