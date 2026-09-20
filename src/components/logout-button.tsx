'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login?loggedOut=1');
    router.refresh();
  }

  return <button type="button" onClick={logout} disabled={busy} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-500 hover:text-emerald-800 disabled:opacity-50">{busy ? 'ログアウト中…' : 'ログアウト'}</button>;
}
