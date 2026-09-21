'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/icon';
import { UserEditForm } from './user-edit-form';
import { TeacherAssignment, type TeacherOption } from './teacher-assignment';
import { PasswordReset } from './password-reset';
import { ResourceLifecycle } from './resource-lifecycle';

interface Detail {
  user: { id: string; display_name: string; email: string | null; login_identifier: string | null; role: string; status: string; archived_at: string | null };
  profile: { grade: string | null; learning_goal: string; exam_results: string; weak_areas: string; daily_time_limit_min: number | null } | null;
  teachers: TeacherOption[];
  assigned: string[];
}

/**
 * 一覧の行から開く編集ポップアップ。
 *
 * 開いたときに1人分だけを取りに行く。一覧の読み込みに全員分の
 * プロフィールや担当を含めると、使わない情報まで毎回運ぶことになる。
 */
export function UserEditDialog({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const headingId = useId();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  useEffect(() => () => restoreScroll(), []);

  async function open() {
    if (dialogRef.current?.open) return;
    setDetail(null); setError('');
    previousOverflow.current = document.body.style.overflow;
    document.body.style.setProperty('overflow', 'hidden');
    dialogRef.current?.showModal();
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? '読み込めませんでした');
      setDetail(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信に失敗しました');
    }
  }

  function close() {
    dialogRef.current?.close();
    router.refresh();
  }

  return <>
    <IconButton icon="edit" label={`${name}を編集`} onClick={open} />
    <dialog ref={dialogRef} aria-labelledby={headingId} onClose={restoreScroll}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}
      className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-6 text-left text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold">{name}</h2>
          <p className="mt-1 text-sm text-slate-500">登録情報と利用状態を変更します。</p>
        </div>
        <button type="button" onClick={close}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100">閉じる</button>
      </div>

      {error ? <p role="alert" className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {!detail && !error ? <p className="mt-6 text-sm text-slate-500">読み込み中…</p> : null}

      {detail ? <div className="mt-6 space-y-8">
        {detail.user.archived_at ? <p className="rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">
          アーカイブ中です。登録情報・学習履歴は残っています。編集や利用の再開には復元が必要です。
        </p> : <>
          <UserEditForm user={detail.user} profile={detail.profile} />
          {detail.user.role === 'student' ? <section>
            <h3 className="font-bold">個別指導の担当の先生</h3>
            <div className="mt-3"><TeacherAssignment studentId={detail.user.id} teachers={detail.teachers} selected={detail.assigned} /></div>
          </section> : null}
          <PasswordReset userId={detail.user.id} name={detail.user.display_name} />
        </>}
        {detail.user.role === 'student'
          ? <ResourceLifecycle kind="student" id={detail.user.id} archived={!!detail.user.archived_at} />
          : null}
      </div> : null}
    </dialog>
  </>;
}
