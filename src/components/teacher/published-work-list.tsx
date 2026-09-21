'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { StatusPill } from '@/components/dashboard';
import { DataTable } from '@/components/data-table';
import { Icon, IconButton, IconLink } from '@/components/icon';
import { DateTimeField } from '@/components/date-time-field';
import { ConfirmDialog } from '@/components/confirm-dialog';
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

const STATUS_LABELS: Record<string, string> = { published: '公開中', draft: '先生の確認待ち', completed: '完了' };

/**
 * `variant='table'` は配信済みの一覧向け。他の一覧と同じ検索・絞り込み・並べ替えで見せる。
 * 確認待ちは1件ずつ本文と理由を読んでチェックする画面なので、表にはしない。
 */
export function PublishedWorkList({ works, variant = 'review' }: { works: PublishedWork[]; variant?: 'review' | 'table' }) {
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
  const [rowStatus, setRowStatus] = useState<{ id: string; message: string } | null>(null);
  const [removing, setRemoving] = useState<PublishedWork | null>(null);
  const [removeError, setRemoveError] = useState('');
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

  /** 1件だけを承認して配信する。まとめて出すより、1件ずつ内容を見て判断してもらう。 */
  async function publishOne(work: PublishedWork) {
    if (busy || refreshing) return;
    if (!work.dueAt) { setRowStatus({ id: work.assignmentId, message: '先に期限を設定してください' }); return; }
    setBusy(true); setRowStatus({ id: work.assignmentId, message: '配信しています…' });
    try {
      const response = await fetch('/api/topics/review', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publish: true, items: [{ id: work.assignmentId, revision: work.revision, title: work.title, body: work.body, content: work.content, difficulty: work.difficulty, dueAt: new Date(work.dueAt).toISOString() }] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '配信できませんでした');
      setRefreshTokens([`${work.assignmentId}:${work.revision}`]);
      setRowStatus(null); router.refresh();
    } catch (error) {
      setRowStatus({ id: work.assignmentId, message: error instanceof Error ? error.message : '通信に失敗しました' });
    } finally { setBusy(false); }
  }

  async function remove() {
    const work = removing;
    if (!work || busy) return;
    setBusy(true); setRemoveError('');
    try {
      const response = await fetch(`/api/topics/${work.assignmentId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '取り下げられませんでした');
      setRemoving(null); router.refresh();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : '通信に失敗しました');
    } finally { setBusy(false); }
  }

  return <>
    {refreshing ? <p role="status" className="mb-3 text-sm text-emerald-800">保存した内容を表示に反映しています… <button type="button" onClick={() => router.refresh()} className="underline">表示を再取得</button></p> : null}
    {variant === 'table' ? <DataTable
      rows={works}
      getKey={work => work.assignmentId}
      searchIn={work => `${work.title} ${work.classroomName} ${work.targetName}`}
      searchPlaceholder="お題・クラス・対象で検索"
      unit="件"
      empty="該当する課題はありません"
      initialSort={{ key: 'due', direction: 'desc' }}
      filters={[
        { key: 'classroom', label: 'クラス', options: [...new Set(works.map(work => work.classroomName))].sort((a, b) => a.localeCompare(b, 'ja')).map(name => ({ value: name, label: name })), match: (work, value) => work.classroomName === value },
        { key: 'status', label: '状態', options: [{ value: 'published', label: '公開中' }, { value: 'completed', label: '完了' }], match: (work, value) => work.status === value },
        { key: 'difficulty', label: '難易度', options: DIFFICULTY_LABELS.map((label, index) => ({ value: String(index + 1), label: `Lv.${index + 1} ${label}` })), match: (work, value) => work.difficulty === Number(value) },
      ]}
      columns={[
        { key: 'title', label: 'お題', sortBy: work => work.title, render: work => <button type="button" onClick={() => open(work)}
          disabled={busy || refreshing || !work.questionId} aria-haspopup="dialog"
          className="text-left font-bold text-[#237d75] underline disabled:no-underline disabled:opacity-60">{work.title}</button> },
        { key: 'target', label: 'クラス・対象', sortBy: work => `${work.classroomName} ${work.targetName}`, render: work => <span className="text-slate-500">{work.classroomName} · {work.targetName}</span> },
        { key: 'difficulty', label: '難易度', hideOnMobile: true, align: 'right', sortBy: work => work.difficulty, render: work => `Lv.${work.difficulty}` },
        { key: 'due', label: '期限', hideOnMobile: true, align: 'right', sortBy: work => work.dueAt, render: work => <span className="whitespace-nowrap">{formatDateTime(work.dueAt)}</span> },
        { key: 'status', label: '状態', sortBy: work => STATUS_LABELS[work.status] ?? work.status, render: work => <StatusPill tone={work.status === 'published' ? 'emerald' : work.status === 'completed' ? 'amber' : 'blue'}>{STATUS_LABELS[work.status] ?? work.status}</StatusPill> },
        { key: 'actions', label: '操作', align: 'right', render: work => <span className="flex items-center justify-end gap-1 whitespace-nowrap">
          <IconButton icon="edit" label={`${work.title}を編集`} disabled={busy || refreshing || !work.questionId} onClick={() => open(work)} />
          <IconButton icon="delete" label={`${work.title}を取り下げる`} tone="danger" disabled={busy || refreshing} onClick={() => { setRemoveError(''); setRemoving(work); }} />
          <IconLink icon="insights" label={`${work.title}の分析を見る`} href={`/teacher/works/${work.assignmentId}`} />
        </span> },
      ]}
    /> : <div className="space-y-4">
      {works.map((work) => {
        const status = rowStatus?.id === work.assignmentId ? rowStatus.message : '';
        const draft = work.status === 'draft';
        return <article key={work.assignmentId} className="rounded-2xl border border-[#e3eaee] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusPill tone={draft ? 'blue' : work.status === 'published' ? 'emerald' : 'amber'}>
                  {STATUS_LABELS[work.status] ?? work.status}
                </StatusPill>
                <span className="rounded-full bg-[#f3f7f7] px-2.5 py-1 font-bold text-[#52637d]">Lv.{work.difficulty}</span>
                {work.minutes ? <span className="inline-flex items-center gap-1 text-slate-500">
                  <Icon name="schedule" className="text-[16px]" />目安 {work.minutes}分
                </span> : null}
              </div>
              <h3 className="mt-2 text-lg font-bold">{work.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Icon name={work.studentId ? 'person' : 'group'} className="text-[18px]" />
                  {work.classroomName} · {work.targetName}
                </span>
                <span className={`inline-flex items-center gap-1 ${work.dueAt ? '' : 'font-bold text-rose-600'}`}>
                  <Icon name="event" className="text-[18px]" />
                  {work.dueAt ? `期限 ${formatDateTime(work.dueAt)}` : '期限が未設定'}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                <IconButton icon="edit" label={`${work.title}を編集`}
                  disabled={busy || refreshing || !work.questionId} onClick={() => open(work)} />
                <IconButton icon="delete" label={`${work.title}を取り下げる`} tone="danger"
                  disabled={busy || refreshing} onClick={() => { setRemoveError(''); setRemoving(work); }} />
                {!draft ? <IconLink icon="insights" label={`${work.title}の分析を見る`} href={`/teacher/works/${work.assignmentId}`} /> : null}
              </div>
              {draft ? <button type="button" onClick={() => publishOne(work)}
                disabled={busy || refreshing || !work.questionId}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                <Icon name="check_circle" className="text-[20px]" />確認して配信
              </button> : null}
            </div>
          </div>

          {draft ? <>
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-[#f7faf9] p-4 text-sm leading-7 text-slate-800">{work.body}</p>
            <p className="mt-2 text-xs text-slate-500">{work.sourceLabel ?? 'AIからの課題案'}</p>

            {work.rationale ? <details className="mt-3">
              <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-bold text-[#237d75]">
                <Icon name="lightbulb" className="text-[18px]" />この課題を選んだ理由
              </summary>
              {work.revision > 0 ? <p className="mt-2 text-xs text-slate-500">先生が編集済みです。以下はAIが最初に提案したときの理由です。</p> : null}
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-600">{work.rationale}</p>
            </details> : null}

            {work.reviewNotes?.length ? <ul className="mt-3 list-disc rounded-xl bg-amber-50 py-3 pl-7 pr-3 text-sm leading-7 text-amber-900">
              {work.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}
            </ul> : null}

            {work.studentId ? <Link href={`/teacher/students/${work.studentId}#learning-plan`}
              className="mt-3 inline-block text-sm font-bold text-emerald-800 underline">根拠となる評価と学習計画を見る</Link> : null}

            {!work.dueAt || status ? <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              {!work.dueAt ? <span className="text-xs text-rose-700">配信するには編集から期限を設定してください</span> : null}
              {status ? <span role="status" className="text-sm text-slate-600">{status}</span> : null}
            </div> : null}
          </> : status ? <p role="status" className="mt-3 text-sm text-slate-600">{status}</p> : null}
        </article>;
      })}
    </div>}

    <ConfirmDialog
      open={!!removing}
      title="この課題を取り下げますか"
      description={removing ? <>
        <p className="font-bold text-[#17233d]">{removing.title}</p>
        <p className="mt-1">{removing.classroomName} · {removing.targetName}</p>
        <p className="mt-2">一覧から消えて、生徒にも表示されなくなります。提出済みの説明や評価は残ります。</p>
      </> : null}
      confirmLabel="取り下げる"
      busy={busy}
      error={removeError}
      onCancel={() => { if (!busy) { setRemoving(null); setRemoveError(''); } }}
      onConfirm={remove}
    />

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
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-5 text-left text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold">{target?.status === 'draft' ? 'AIの提案を確認して配信' : '課題を編集'}</h2>
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
          <div className="text-sm font-bold">宿題の期限
            <DateTimeField disabled={busy} value={dueAt} onChange={setDueAt} />
          </div>
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
