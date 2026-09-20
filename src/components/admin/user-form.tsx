'use client';

import { FormEvent, useState } from 'react';

const fieldClass = 'mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

export function UserForm() {
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('登録中…');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: form.get('displayName'),
        email: form.get('email'),
        password: form.get('password'),
        role: form.get('role'),
        loginIdentifier: form.get('loginIdentifier') || undefined,
      }),
    });
    if (response.ok) {
      event.currentTarget.reset();
      setStatus('登録しました。');
      window.location.reload();
    } else {
      const result = await response.json().catch(() => ({}));
      setStatus(result.message ?? '登録できませんでした。');
    }
  }

  return <details className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
    <summary className="cursor-pointer font-bold text-emerald-900">ユーザーを追加する</summary>
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold">氏名<input name="displayName" required className={fieldClass} placeholder="山田 花子" /></label>
      <label className="text-sm font-bold">ロール<select name="role" defaultValue="student" className={fieldClass}><option value="student">生徒</option><option value="teacher">先生</option><option value="admin">管理者</option></select></label>
      <label className="text-sm font-bold">メールアドレス<input name="email" required type="email" className={fieldClass} placeholder="user@example.com" autoComplete="email" /></label>
      <label className="text-sm font-bold">ログインID（生徒のみ）<input name="loginIdentifier" className={fieldClass} placeholder="student02" autoCapitalize="none" /></label>
      <label className="text-sm font-bold sm:col-span-2">初期パスワード<input name="password" required minLength={8} type="password" className={fieldClass} autoComplete="new-password" /><span className="mt-1 block text-xs font-normal text-slate-500">8文字以上。登録後、生徒・先生へ安全な方法で伝えてください。</span></label>
      <div className="flex items-center gap-3 sm:col-span-2"><button className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">登録する</button><span role="status" className="text-sm text-slate-600">{status}</span></div>
    </form>
  </details>;
}
