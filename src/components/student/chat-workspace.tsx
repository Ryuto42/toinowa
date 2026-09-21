'use client';
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

/** 会話だけをスクロールし、入力欄は可視ビューポート内に残す。 */
export function ChatWorkspace({ title, tutorial = false, children }: { title: string; tutorial?: boolean; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    const resize = () => {
      if (!root.current) return;
      const height = viewport?.height ?? window.innerHeight;
      root.current.style.height = `${height}px`;
      root.current.style.top = `${viewport?.offsetTop ?? 0}px`;
      root.current.dataset.compact = String(height < 480);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      document.body.style.overflow = previous;
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <section ref={root} aria-label="AIとのチャット" className="chat-workspace fixed inset-x-0 top-0 z-40 flex h-dvh min-h-0 flex-col bg-[#fbfcfb] lg:left-[286px]">
    <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 lg:px-10 lg:pt-5">
      <header className="chat-heading flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0"><Link href="/student/study" className="text-xs font-semibold text-emerald-800 underline underline-offset-4">← AIワークへ</Link><h1 className="mt-1 max-h-16 overflow-y-auto text-lg font-bold leading-snug text-slate-900 sm:text-2xl">{title}</h1></div>
        <Link href="/student/guide" className="mt-1 shrink-0 text-xs font-semibold text-emerald-800 underline underline-offset-4">使い方ガイド</Link>
      </header>
      <p className="chat-instructions shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-6 text-emerald-900">{tutorial ? 'まずは短いやり取りを練習しよう。正解や点数はありません。' : 'AIはまだ知らない聞き手です。あなたの言葉で教えてあげよう。'}</p>
      {children}
    </div>
  </section>;
}
