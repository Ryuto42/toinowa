'use client';

import { useEffect, useId, useRef } from 'react';
import { Icon, type IconName } from '@/components/icon';
import { isBackdropClick } from '@/components/dialog-backdrop';

/**
 * 取り消し・削除の確認ポップアップ。
 *
 * 消す操作は画面ごとに文言も見た目も違うと、「何が起きるのか」を
 * 毎回読み直すことになる。枠・色・ボタンの並びをここに集約する。
 *
 * 処理中は閉じられない。途中で閉じると結果を確認できないまま画面を離れてしまう。
 */
export function ConfirmDialog({
  open, title, description, confirmLabel, icon = 'delete', tone = 'danger',
  busy = false, error = '', confirmDisabled = false, onCancel, onConfirm, children,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  icon?: IconName;
  tone?: 'danger' | 'default';
  busy?: boolean;
  error?: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const danger = tone === 'danger';

  return <dialog ref={ref} aria-labelledby={headingId}
    onCancel={(event) => { if (busy) event.preventDefault(); else onCancel(); }}
    onClose={onCancel}
    onClick={(event) => { if (!busy && isBackdropClick(event)) onCancel(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 text-left text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-7">
    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${danger ? 'bg-[#fff0f1] text-[#b34e5b]' : 'bg-[#eff3f3] text-[#52637d]'}`}>
      <Icon name={icon} className="text-[26px]" />
    </span>
    <h2 id={headingId} className="mt-4 text-xl font-bold">{title}</h2>
    {description ? <div className="mt-2 text-sm leading-7 text-[#60708d]">{description}</div> : null}
    {children ? <div className="mt-5">{children}</div> : null}
    {error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button type="button" disabled={busy} onClick={onCancel}
        className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
        キャンセル
      </button>
      <button type="button" disabled={busy || confirmDisabled} onClick={onConfirm}
        className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${danger ? 'bg-rose-700 hover:bg-rose-800' : 'bg-emerald-700 hover:bg-emerald-800'}`}>
        {busy ? '処理中…' : confirmLabel}
      </button>
    </div>
  </dialog>;
}
