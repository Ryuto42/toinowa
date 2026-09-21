'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CredentialsReceipt, type Credentials } from './credentials-receipt';
export function PasswordReset({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [self, setSelf] = useState(false);
  function close() { dialog.current?.close(); setCredentials(null); if (self) router.push('/change-password'); }
  async function reset() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '再発行できませんでした');
      setSelf(result.self); setCredentials(result.credentials);
    } catch (error) { setError(error instanceof Error ? error.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">パスワードのリセット</h2><p className="mt-2 text-sm text-slate-600">新しい初期パスワードを発行し、本人の次回ログイン時に変更を求めます。</p><button type="button" onClick={() => { setError(''); dialog.current?.showModal(); }} className="mt-4 rounded-lg border border-emerald-700 px-4 py-2 font-bold text-emerald-800">初期パスワードを再発行</button>
    <dialog ref={dialog} aria-label="パスワードの再発行" onCancel={event => { if (busy || credentials) event.preventDefault(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl backdrop:bg-slate-950/40">
      <h2 className="text-lg font-bold">{credentials ? '初期パスワードを発行しました' : `${name}さんのパスワードを再発行`}</h2>
      {credentials ? <CredentialsReceipt credentials={credentials} onClose={close} /> : <><p className="mt-4 text-sm leading-7">現在のパスワードは使えなくなります。発行されたログイン情報を本人に渡してください。</p>{error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}<div className="mt-5 flex gap-3"><button disabled={busy} onClick={reset} className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? '発行中…' : '再発行する'}</button><button disabled={busy} onClick={close} className="rounded-lg border px-4 py-2">キャンセル</button></div></>}
    </dialog>
  </section>;
}
