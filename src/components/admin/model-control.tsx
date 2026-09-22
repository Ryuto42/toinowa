'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface ModelRow { model: string; paused: boolean; used: number; pausable: boolean }

/**
 * モデルの稼働状況をまとめ、ポップアップで一時停止・再開を行う。
 *
 * 一時停止は次の呼び出しから代替モデルへ切り替わる操作で、
 * 画面を開いたついでに押せてしまうと事故になる。1枚ダイアログを挟む。
 */
export function ModelControl({ models, tierLabel, primary }: {
  models: ModelRow[];
  tierLabel: string;
  primary: { label: string; model: string }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const headingId = useId();
  const [rows, setRows] = useState(models);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  useEffect(() => () => restoreScroll(), []);

  function open() {
    if (dialogRef.current?.open) return;
    setError('');
    previousOverflow.current = document.body.style.overflow;
    document.body.style.setProperty('overflow', 'hidden');
    dialogRef.current?.showModal();
  }
  function close() {
    if (busy) return;
    dialogRef.current?.close();
  }

  async function toggle(model: string, paused: boolean) {
    setBusy(model); setError('');
    try {
      const response = await fetch('/api/ops/demo/kill-model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, disabled: !paused, reason: '管理画面からの一時停止' }),
      });
      if (!response.ok) { setError('切り替えられませんでした。時間をおいてもう一度お試しください。'); return; }
      setRows((current) => current.map((row) => row.model === model ? { ...row, paused: !paused } : row));
    } catch {
      setError('通信に失敗しました。');
    } finally {
      setBusy(null);
    }
  }

  const pausedCount = rows.filter((row) => row.paused).length;
  // 自動選択で解決された先は設定に無く、停止操作もできない。数え方を分けないと実態がぼやける。
  const autoCount = rows.filter((row) => !row.pausable).length;

  return <div className="h-full rounded-2xl border border-[#e3eaee] bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-bold">モデルの稼働</p>
        <p className="mt-1 text-sm text-slate-500">
          {pausedCount
            ? <><span className="font-bold text-rose-700">{pausedCount}件を一時停止中</span>・稼働 {rows.length - pausedCount}件</>
            : <>{rows.length}件すべて稼働中</>}
          {' · '}{tierLabel}
          {autoCount ? <>{' · '}自動選択で解決 {autoCount}件</> : null}
        </p>
      </div>
      <button type="button" onClick={open} aria-haspopup="dialog"
        className="shrink-0 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50">
        モデルの稼働を管理
      </button>
    </div>

    {/* どのモデルが動いているかは一目で分かるようにしておく。
        操作はポップアップに置き、この行は読むだけにする。 */}
    <ul className="mt-3 flex flex-wrap gap-2">
      {rows.map((row) => <li key={row.model}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs ${row.paused ? 'bg-rose-50 text-rose-700' : 'bg-[#eff9f6] text-[#1c6e60]'}`}>
        <span aria-hidden="true">{row.paused ? '■' : '●'}</span>{row.model}
      </li>)}
    </ul>

    <dialog ref={dialogRef} aria-labelledby={headingId} onClose={restoreScroll}
      onCancel={(event) => { if (busy) event.preventDefault(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-5 text-left text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold">モデルの稼働</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            一時停止すると、次の呼び出しから代替モデルへ切り替わります。生徒の学習は止まりません。
          </p>
        </div>
        <button type="button" aria-label="閉じる" disabled={!!busy} onClick={close}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 disabled:opacity-40">閉じる</button>
      </div>

      {error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

      <ul className="mt-5 space-y-2">
        {rows.map((row) => <li key={row.model}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3eaee] p-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-bold">{row.model}</p>
            <p className="mt-1 text-xs text-slate-500">
              <span className={row.paused ? 'font-bold text-rose-700' : 'font-bold text-emerald-700'}>
                {row.paused ? '一時停止中' : row.pausable ? '稼働中' : 'ルーターが選択'}
              </span>
              {' · '}直近1時間 {row.used}件
            </p>
          </div>
          {row.pausable
            ? <button type="button" disabled={busy !== null} onClick={() => toggle(row.model, row.paused)}
                className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-50 ${row.paused ? 'bg-emerald-700' : 'bg-slate-700'}`}>
                {busy === row.model ? '切替中…' : row.paused ? '再開する' : '一時停止する'}
              </button>
            : <span className="shrink-0 whitespace-nowrap rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500">自動選択の結果</span>}
        </li>)}
      </ul>

      <div className="mt-5 rounded-xl bg-[#f7faf9] p-3 text-xs leading-6 text-slate-600">
        <p className="font-bold">用途ごとの主モデル</p>
        <ul className="mt-1">
          {primary.map((item) => <li key={item.label}>{item.label}: <span className="font-mono">{item.model}</span></li>)}
        </ul>
      </div>
    </dialog>
  </div>;
}
