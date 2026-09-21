'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PreparationForm } from '@/components/teacher/preparation-form';
import { TopicForm } from '@/components/teacher/topic-form';

interface Classroom { id: string; name: string }
interface Student { id: string; name: string; classroomId: string }

/**
 * 課題づくりの入口。普段は授業記録を渡すだけで済むので、それを最初に置き、
 * お題を自分で決めたいときの手動設定は下の折りたたみにまとめる。
 *
 * フォームは開いている間だけマウントする。閉じたら入力は破棄され、
 * 次に開いたときは必ず初期状態から始まる。
 */
export function CreateWorkDialog({ classrooms, students, topicClassrooms }: {
  classrooms: Classroom[];
  students: Student[];
  topicClassrooms: Classroom[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const headingId = useId();
  const [mounted, setMounted] = useState(false);

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
        <h2 id={headingId} className="text-2xl font-bold">説明ワークを作成</h2>
        <button type="button" aria-label="閉じる" onClick={close}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100">閉じる</button>
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        授業メモや資料を渡すと、AIが生徒ごとにお題と学習計画を用意します。課題名も自動で付き、配信前に編集できます。
      </p>

      <div className="mt-6">
        {mounted ? <PreparationForm classrooms={classrooms} students={students} onDone={close} /> : null}
      </div>

      {/* お題を自分で決めたい場合の逃げ道。普段は使わないので閉じておく。 */}
      <details className="mt-8 rounded-xl border border-slate-200 p-5">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">手動で設定する</summary>
        <p className="mt-2 text-sm leading-6 text-slate-500">テーマや問題文を自分で決めて、説明ワークを1つ作ります。</p>
        <div className="mt-5">
          {mounted ? <TopicForm classrooms={topicClassrooms} students={students} /> : null}
        </div>
      </details>
    </dialog>
  </>;
}
