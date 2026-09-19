'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StartChatButton({ lessonId }: { lessonId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    const response = await fetch('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'web', lessonId }) });
    const result = await response.json();
    if (response.ok && result.conversation?.id) router.push(`/student/chat/${result.conversation.id}`);
    else setBusy(false);
  }
  return <button onClick={start} disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50">{busy ? '準備中…' : 'AIに質問する'}</button>;
}
