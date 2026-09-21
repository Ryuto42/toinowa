'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** お知らせ一覧を開いたら既読にする。未読バッジが押しても減らない状態を作らない。 */
export function MarkNotificationsRead({ unread }: { unread: number }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!unread || done.current) return;
    done.current = true;
    void fetch('/api/notifications', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then((response) => { if (response.ok) router.refresh(); })
      .catch(() => {});
  }, [unread, router]);
  return null;
}
