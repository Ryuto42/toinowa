'use client';
import { useState, type FormEvent } from 'react';
export function PasswordChangeForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmation')) { setError('新しいパスワードが一致しません'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: data.get('currentPassword'), password: data.get('password') }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '変更できませんでした');
      window.location.assign(result.redirectTo);
    } catch (e) { setError(e instanceof Error ? e.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">パスワードを変更してください</h1><p className="mt-3 text-sm leading-7 text-slate-600">初回ログインでは、配られた初期パスワードを自分のパスワードに変更してから利用します。</p><form onSubmit={submit} className="mt-6 space-y-5">
    <label className="block text-sm font-bold">現在のパスワード<input required name="currentPassword" type="password" autoComplete="current-password" className="mt-2 w-full rounded-xl border p-3" /></label>
    <label className="block text-sm font-bold">新しいパスワード（12文字以上）<input required name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-xl border p-3" /></label>
    <label className="block text-sm font-bold">新しいパスワード（確認）<input required name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-xl border p-3" /></label>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}<button disabled={busy} className="w-full rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:opacity-50">{busy ? '変更中…' : '変更して利用を開始'}</button>
  </form><button className="mt-5 text-sm text-slate-600 underline" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.assign(new URL('/login', window.location.origin).href); }}>ログアウト</button></section></main>;
}
