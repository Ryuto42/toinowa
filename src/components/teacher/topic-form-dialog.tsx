'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { TopicForm } from '@/components/teacher/topic-form';

type Props = {
  classrooms: Array<{ id: string; name: string }>;
  students: Array<{ id: string; name: string; classroomId: string }>;
};

/**
 * 説明ワークの作成フォームをモーダルで開く。
 *
 * ネイティブの <dialog> + showModal() を使うのは、フォーカストラップ・Escapeで閉じる・
 * 背景の不活性化をブラウザ側に任せられるため。自前実装よりアクセシビリティが確実。
 *
 * フォームは開いている間だけマウントする。閉じたら入力状態は破棄され、
 * 次に開いたときは必ず初期状態から始まる（前回の途中入力が残って混乱するのを防ぐ）。
 */
export function TopicFormDialog({ classrooms, students }: Props) {
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

  function close() {
    dialogRef.current?.close();
  }

  return <>
    <button
      type="button"
      onClick={open}
      aria-haspopup="dialog"
      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
    >
      個別に課題を指定（必要なとき）
    </button>

    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onClose={() => { restoreScroll(); setMounted(false); }}
      onClick={event => {
        // ダイアログ本体の外側（＝バックドロップ）をクリックしたときだけ閉じる
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold">個別に課題を指定（必要なとき）</h2>
          <p className="mt-1 text-sm text-slate-500">普段は授業記録からAIに任せられます。特定のテーマやお題を指定したい場合に使います。</p>
        </div>
        <button
          type="button"
          aria-label="説明ワークの作成を閉じる"
          onClick={close}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
        >
          閉じる
        </button>
      </div>

      <div className="mt-6">
        {mounted ? <TopicForm classrooms={classrooms} students={students} /> : null}
      </div>
    </dialog>
  </>;
}
