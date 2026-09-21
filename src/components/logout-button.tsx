'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/icon';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login?loggedOut=1');
    router.refresh();
  }

  return <IconButton icon="logout" label={busy ? 'ログアウト中' : 'ログアウト'} disabled={busy} onClick={logout} />;
}
