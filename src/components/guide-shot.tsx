'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { isBackdropClick } from '@/components/dialog-backdrop';

/**
 * ガイドの画面写真。
 *
 * 一覧では小さく置き、押すと拡大して重ねて見せる。別タブで原寸を開くと
 * ガイドの読んでいた位置を見失うので、同じ画面の上に出して閉じたら戻す。
 * 開閉の動きは globals.css の dialog 共通ルール（.lightbox で拡大幅だけ変える）。
 */
export function GuideShot({ src, caption, alt }: { src: string; caption?: string; alt: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.setProperty('overflow', 'hidden');
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function restore() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }

  return <figure className="lg:w-[320px] lg:shrink-0">
    <button type="button" onClick={() => setOpen(true)} title="画面写真を拡大する"
      className="block w-full overflow-hidden rounded-xl border border-[#e3eaee]">
      <Image src={`/guide/${src}.png`} alt={alt} width={1280} height={820} sizes="320px"
        className="w-full transition duration-200 hover:scale-[1.03]" />
    </button>
    {caption ? <figcaption className="mt-2 text-xs leading-6 text-[#8a9ab2]">{caption}</figcaption> : null}

    <dialog ref={dialogRef} aria-label={alt}
      onClose={() => { restore(); setOpen(false); }}
      onCancel={() => setOpen(false)}
      onClick={(event) => { if (isBackdropClick(event)) setOpen(false); }}
      className="lightbox m-auto w-[min(1100px,calc(100vw-3rem))] max-w-none rounded-2xl border-0 bg-white p-3 shadow-2xl backdrop:bg-slate-950/60">
      <Image src={`/guide/${src}.png`} alt={alt} width={1280} height={820} sizes="(min-width: 1200px) 1100px, 92vw"
        className="w-full rounded-xl" />
      <div className="flex items-center justify-between gap-4 px-2 py-2">
        <p className="text-xs text-[#8a9ab2]">{caption ?? ''}</p>
        <button type="button" onClick={() => setOpen(false)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100">閉じる</button>
      </div>
    </dialog>
  </figure>;
}
