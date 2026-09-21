'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** 画面が落ちたときに素のエラー画面を見せない。原因は出さず、次の行動だけ示す。 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const forbidden = error.message.includes('権限') || error.name === 'ForbiddenError';
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfcfb] px-6 py-16 text-[#17233d]">
    <div className="w-full max-w-md rounded-[22px] border border-[#e3eaee] bg-white p-8 text-center">
      <h1 className="text-2xl font-bold">{forbidden ? 'この画面は表示できません' : '画面を表示できませんでした'}</h1>
      <p className="mt-3 text-sm leading-7 text-[#60708d]">
        {forbidden
          ? 'お使いのアカウントには、このページを見る権限がありません。'
          : '一時的な問題の可能性があります。もう一度お試しください。'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {forbidden ? null : <button type="button" onClick={reset} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">もう一度試す</button>}
        <Link href="/" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">トップへ戻る</Link>
      </div>
      {error.digest ? <p className="mt-5 text-xs text-slate-400">問い合わせ番号: {error.digest}</p> : null}
    </div>
  </main>;
}
