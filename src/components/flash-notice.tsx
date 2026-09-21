'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Toast } from '@/components/toast';

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
  }, [message, pathname, router]);

  if (!message) return null;
  return <Toast message={message} onClose={() => setMessage(null)} />;
}

/** 画面遷移のあとに一度だけ出す通知。`?notice=` を読んで表示し、URLから取り除く。 */
export function FlashNotice() {
  return <Suspense fallback={null}><Notice /></Suspense>;
}
