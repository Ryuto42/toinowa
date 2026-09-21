'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Icon } from '@/components/icon';

/**
 * 画面が落ちたときに素のエラー画面を見せない。
 *
 * 原因そのものは出さない（内部情報が漏れる）。代わりに、
 * 次に何をすればいいかと、管理者へ伝える問い合わせ番号だけを示す。
 * 生徒・先生・管理者のどの画面でもこれが出る。
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const forbidden = error.message.includes('権限') || error.name === 'ForbiddenError';

  return <main className="flex min-h-screen items-center justify-center bg-[#fbfcfb] px-6 py-16 text-[#17233d]">
    <div className="w-full max-w-lg rounded-[22px] border border-[#e3eaee] bg-white p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0f1] text-[#b34e5b]">
        <Icon name="error" className="text-[26px]" />
      </span>
      <h1 className="mt-5 text-2xl font-bold">
        {forbidden ? 'この画面は表示できません' : '画面を表示できませんでした'}
      </h1>
      <p className="mt-3 text-sm leading-7 text-[#60708d]">
        {forbidden
          ? 'お使いのアカウントには、このページを見る権限がありません。必要な場合は学校の管理者にご連絡ください。'
          : '一時的な問題の可能性があります。もう一度試しても直らない場合は、学校の管理者にご連絡ください。'}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {forbidden ? null : <button type="button" onClick={reset}
          className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
          もう一度試す
        </button>}
        <Link href="/" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
          自分のホームへ戻る
        </Link>
      </div>

      <div className="mt-6 rounded-xl bg-[#f7faf9] p-4 text-sm leading-7 text-[#52637d]">
        <p className="font-bold text-[#17233d]">管理者に連絡するとき</p>
        <p className="mt-1">いつ・どの画面で起きたかと、下の番号をお伝えください。原因を特定しやすくなります。</p>
        <p className="mt-2 font-mono text-xs text-slate-500">
          問い合わせ番号: {error.digest ?? '（番号なし）'}
        </p>
      </div>
    </div>
  </main>;
}
