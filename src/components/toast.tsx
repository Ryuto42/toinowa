'use client';

import { useEffect, useState } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

const TONES: Record<ToastTone, { ring: string; text: string; mark: string; symbol: string }> = {
  success: { ring: 'border-emerald-200', text: 'text-emerald-800', mark: 'bg-emerald-100 text-emerald-700', symbol: '✓' },
  error: { ring: 'border-rose-200', text: 'text-rose-800', mark: 'bg-rose-100 text-rose-700', symbol: '!' },
  info: { ring: 'border-slate-200', text: 'text-slate-800', mark: 'bg-slate-100 text-slate-600', symbol: 'i' },
};

/**
 * 画面上部に一度だけ出る通知。
 *
 * 出るときと消えるときで同じ動きにする。消えるほうを省くと、
 * 読んでいる途中で急に消えたように見える。
 *
 * 表示・非表示を1つの state（open）で持ち、閉じ切ってから onClose を呼ぶ。
 * 先に親から消すと、閉じるアニメーションが走らない。
 */
export function Toast({ message, tone = 'success', duration = 5000, onClose }: {
  message: string;
  tone?: ToastTone;
  duration?: number;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 1フレーム置いてから開く。初期状態と同時に指定すると変化にならない。
    const frame = requestAnimationFrame(() => setOpen(true));
    const hide = window.setTimeout(() => setOpen(false), duration);
    const done = window.setTimeout(() => onClose?.(), duration + 220);
    return () => { cancelAnimationFrame(frame); clearTimeout(hide); clearTimeout(done); };
  }, [duration, onClose]);

  const style = TONES[tone];
  return <div
    role="status" aria-live="polite"
    onClick={() => setOpen(false)}
    className={`fixed inset-x-4 top-4 z-[60] mx-auto flex max-w-sm cursor-pointer items-center gap-3 rounded-2xl border bg-white px-5 py-4 text-sm font-bold shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)] transition-all duration-200 ease-out ${style.ring} ${style.text} ${
      open ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}
  >
    <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.mark}`}>{style.symbol}</span>
    {message}
  </div>;
}
