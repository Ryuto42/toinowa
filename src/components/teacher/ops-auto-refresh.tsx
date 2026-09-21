'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 先生の画面を、生徒の提出やAIの実行に合わせて自動で更新する。
 *
 * キャッシュを捨てるだけでは、すでに開いているブラウザは描き直されない。
 * 状態の指紋だけを定期取得し、変わったときに router.refresh() を呼ぶ。
 * タブが裏にあるときは何もしない（デモ中に無駄な問い合わせを増やさない）。
 */
export function OpsAutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const version = useRef<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/ops/events', { cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as { version?: string };
        if (!body.version) return;
        if (version.current !== null && version.current !== body.version) {
          setUpdatedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          router.refresh();
        }
        version.current = body.version;
      } catch {
        // 一時的な失敗は黙って次の周期に任せる
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), intervalMs);
    document.addEventListener('visibilitychange', poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [router, intervalMs]);

  // 更新が来たときだけ知らせる。待っている間は何も出さない。
  // 読み上げ用の領域は常に置いたままにする（後から差し込むと通知されない）。
  return <p role="status" aria-live="polite"
    className={updatedAt ? 'mb-3 text-xs text-[#8a9ab2]' : 'sr-only'}>
    {updatedAt ? `新しい記録を受け取りました（${updatedAt}）` : ''}
  </p>;
}
