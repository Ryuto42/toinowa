'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PreparationForm } from '@/components/teacher/preparation-form';
import { ManualTopicForm } from '@/components/teacher/manual-topic-form';

interface Classroom { id: string; name: string }
interface Student { id: string; name: string; classroomId: string }

/**
 * 課題づくりの入口。普段は授業記録を渡すだけで済むので、それを最初に置き、
 * お題を自分で決めたいときの手動設定は下の折りたたみにまとめる。
 *
 * フォームは開いている間だけマウントする。閉じたら入力は破棄され、
 * 次に開いたときは必ず初期状態から始まる。
 */
const STEPS = ['授業記録を渡す', 'AIが生徒別に準備する', '先生が確認して配信'];

/** いまどこまで進んだかを示す。バーの伸びと番号の状態を同じ値から描く。 */
function Stepper({ current }: { current: number }) {
  return <ol className="mt-5">
    <li aria-hidden="true" className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#e7efee]">
      <span className="block h-full rounded-full bg-emerald-700 transition-[width] duration-500"
        style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }} />
    </li>
    <li className="grid gap-3 sm:grid-cols-3">
      {STEPS.map((text, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return <div key={text} aria-current={active ? 'step' : undefined}
          className={`flex items-center gap-3 rounded-xl p-4 text-sm font-bold transition ${
            active ? 'bg-emerald-700 text-white'
              : done ? 'bg-emerald-50 text-emerald-900'
              : 'bg-[#f3f7f7] text-[#8a9ab2]'}`}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
            active ? 'bg-white text-emerald-800'
              : done ? 'bg-emerald-700 text-white'
              : 'bg-white text-[#8a9ab2]'}`}>
            {done ? '✓' : step}
          </span>
          {text}
        </div>;
      })}
    </li>
  </ol>;
}

export function CreateWorkDialog({ classrooms, students }: {
  classrooms: Classroom[];
  students: Student[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const headingId = useId();
  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState({ classroomId: '', studentId: null as string | null, dueAt: '' });
  // 1: 入力中 / 2: 受け付け済み（AIが準備中）。3は画面を閉じたあと一覧で行う。
  const [step, setStep] = useState(1);
  const onContextChange = useCallback((next: { classroomId: string; studentId: string | null; dueAt: string }) => setTarget(next), []);

  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  useEffect(() => () => restoreScroll(), []);

  function open() {
    if (dialogRef.current?.open) return;
    setMounted(true);
    setStep(1);
    previousOverflow.current = document.body.style.overflow;
    document.body.style.setProperty('overflow', 'hidden');
    dialogRef.current?.showModal();
  }
  function close() { dialogRef.current?.close(); }

  return <>
    <button type="button" onClick={open} aria-haspopup="dialog"
      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
      新しく作成
    </button>

    <dialog ref={dialogRef} aria-labelledby={headingId}
      onClose={() => { restoreScroll(); setMounted(false); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}
      className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-6 text-left text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 id={headingId} className="text-2xl font-bold">課題を作成</h2>
        <button type="button" aria-label="閉じる" onClick={close}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100">閉じる</button>
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        授業メモや資料を渡すと、AIが生徒ごとにお題と学習計画を用意します。課題名も自動で付き、配信前に編集できます。
      </p>

      <Stepper current={step} />

      {step === 1 ? <>
        <div className="mt-6">
          {mounted ? <PreparationForm classrooms={classrooms} students={students}
            onDone={() => setStep(2)} onContextChange={onContextChange} /> : null}
        </div>

        {/* お題を自分で決めたい場合の逃げ道。普段は使わないので閉じておく。 */}
        <details className="mt-8 rounded-xl border border-slate-200 p-5">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">手動で設定する</summary>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            AIに考えさせず、書いたお題をそのまま使います。相手と期限は上で選んだものを使います。
          </p>
          <div className="mt-5">
            {mounted ? <ManualTopicForm classroomId={target.classroomId} studentId={target.studentId}
              dueAt={target.dueAt} onDone={() => setStep(2)} /> : null}
          </div>
        </details>
      </> : <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="font-bold text-emerald-950">受け付けました</p>
        <p className="mt-2 text-sm leading-7 text-emerald-900">
          生徒ごとの課題と学習計画を準備しています。この画面を閉じても処理は続きます。
          できあがると「先生の確認待ち」に並ぶので、内容を確認してから配信してください。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={close}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
            閉じて準備状況を見る
          </button>
          <button type="button" onClick={() => setStep(1)}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            続けてもう1件作る
          </button>
        </div>
      </div>}
    </dialog>
  </>;
}
