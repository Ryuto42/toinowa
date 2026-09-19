'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/shared/branding';

export default function LoginPage() {
  const router = useRouter();
  const [schoolCode, setSchoolCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schoolCode, identifier, password }),
    });
    if (!response.ok) {
      setError('学校コード、ID、パスワードを確認してください。');
      setBusy(false);
      return;
    }
    const result = await response.json().catch(() => ({}));
    const next = new URL(window.location.href).searchParams.get('next');
    router.replace(next || result.redirectTo || '/');
    router.refresh();
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[#f6f8f7] px-6 py-16">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">{BRAND.shortName}</p>
        <h1 className="mt-3 text-2xl font-semibold">ログイン</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">学校コードと登録済みのIDで学習を続けます。</p>
        <label className="mt-8 block text-sm font-medium">学校コード
          <input required value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3" autoComplete="organization" />
        </label>
        <label className="mt-4 block text-sm font-medium">メールアドレスまたは生徒ID
          <input required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3" autoComplete="username" />
        </label>
        <label className="mt-4 block text-sm font-medium">パスワード
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3" autoComplete="current-password" />
        </label>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <button disabled={busy} className="mt-6 h-11 w-full rounded-xl bg-emerald-700 font-medium text-white disabled:opacity-50">
          {busy ? '確認中…' : 'ログインする'}
        </button>
      </form>
    </main>
  );
}
