'use client';

import { FormEvent, useEffect, useState } from 'react';

export function LoginForm({ loggedOut, next }: { loggedOut: boolean; next?: string }) {
  const [schoolCode, setSchoolCode] = useState('');
  const [rememberCode, setRememberCode] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(loggedOut ? 'ログアウトしました' : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem('studypilot.organizationCode');
        if (saved) { setSchoolCode(saved); setRememberCode(true); }
      } catch { /* 保存できないブラウザでもログインは利用できる */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationCode: schoolCode, identifier, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError('所属コード、ID、パスワードを確認してください。');
        return;
      }
      // Supabaseが設定した認証Cookieを確実にブラウザへ反映してから、
      // 保護ページをサーバーから読み直す。SPA遷移を先に行うと、
      // 開発環境の127.0.0.1ではCookie反映前のリクエストが走り、
      // ログイン画面へ戻ることがある。
      try {
        if (rememberCode) localStorage.setItem('studypilot.organizationCode', schoolCode.trim());
        else localStorage.removeItem('studypilot.organizationCode');
      } catch { /* 保存の失敗でログインを止めない */ }
      const safeNext = next && /^\/(student|teacher|admin)(\/|$)/.test(next) && !next.includes('\\') ? next : undefined;
      window.location.assign(result.mustChangePassword ? '/change-password' : safeNext || result.redirectTo || '/student/home');
    } catch {
      setError('通信に失敗しました。時間を置いてもう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  return <main className="relative flex min-h-screen items-center justify-center bg-[#f3f7f5] px-4 py-8 text-slate-950 sm:px-6 sm:py-14">
    {notice ? <div role="status" aria-live="polite" className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm font-bold text-emerald-800 shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>{notice}</div> : null}
    <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white px-7 py-9 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.4)] sm:px-12 sm:py-12">
      <div className="text-center">
        <p className="text-sm font-bold text-emerald-700">ログイン</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">学習画面に入る</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">所属先から案内された情報を入力してください。</p>
      </div>
      <form onSubmit={submit} className="mx-auto mt-8 max-w-md space-y-5">
          <label className="block text-sm font-bold">所属コード
            <input required value={schoolCode} onChange={(event) => setSchoolCode(event.target.value)} placeholder="例：demo" autoComplete="organization" autoCapitalize="none" spellCheck={false} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={rememberCode} onChange={event => { setRememberCode(event.target.checked); if (!event.target.checked) { try { localStorage.removeItem('studypilot.organizationCode'); } catch {} } }} />所属コードをこのブラウザに保存する</label>
          <label className="block text-sm font-bold">ログインID またはメールアドレス
            <input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="例：student01" autoComplete="username" autoCapitalize="none" spellCheck={false} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
          </label>
          <label className="block text-sm font-bold">パスワード
            <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="パスワードを入力" autoComplete="current-password" className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
          </label>
          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}
          <button disabled={busy} className="h-12 w-full rounded-xl bg-emerald-700 font-bold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-50">{busy ? '確認中…' : 'ログインする'}</button>
      </form>
    </section>
  </main>;
}
