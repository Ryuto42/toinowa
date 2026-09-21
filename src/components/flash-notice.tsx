'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const MESSAGES: Record<string, string> = {
  'password-changed': 'パスワードを変更しました',
};

function Notice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const key = params.get('notice');
  // 初回描画の時点で決める。効果の中で state を立てると、URLから notice を外した
  // 直後の再描画で「通知なし」に戻ってしまう。
  const [message, setMessage] = useState<string | null>(() => (key ? MESSAGES[key] ?? null : null));

  useEffect(() => {
    if (!message) return;
    // URLから notice を外す。再読み込みや戻る操作で同じ通知が出続けないようにする。
    const rest = new URLSearchParams(window.location.search);
    rest.delete('notice');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    const timer = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message, pathname, router]);

  if (!message) return null;
  return <div role="status" aria-live="polite"
    className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm font-bold text-emerald-800 shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)]">
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
    {message}
  </div>;
}

/** 画面遷移のあとに一度だけ出す通知。`?notice=` を読んで表示し、URLから取り除く。 */
export function FlashNotice() {
  return <Suspense fallback={null}><Notice /></Suspense>;
}
