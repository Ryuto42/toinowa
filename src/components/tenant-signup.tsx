'use client';

import { FormEvent, useState } from 'react';

interface Issued { code: string; email: string; initialPassword: string }

/**
 * ログイン画面からの所属の新規申請。
 *
 * 初期パスワードは**この画面でしか表示されない**。
 * サーバーは生成時にしか平文を持たず、以後は取り出せない。
 * そのことを画面上でも明記し、閉じる操作を押しにくくしている。
 */
export function TenantSignup() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setOpen(false);
    setIssued(null);
    setError(null);
    setEmail('');
    setCode('');
    setCopied(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/tenants/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim().toLowerCase() }),
      });
      const result = await response.json() as Partial<Issued> & { message?: string };
      if (!response.ok || !result.initialPassword) {
        setError(result.message ?? '申請できませんでした。入力内容を確認してください。');
        return;
      }
      setIssued(result as Issued);
    } catch {
      setError('通信に失敗しました。時間を置いてもう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(
        `所属コード: ${issued.code}\nメールアドレス: ${issued.email}\n初期パスワード: ${issued.initialPassword}`,
      );
      setCopied(true);
    } catch {
      setError('コピーできませんでした。手で控えてください。');
    }
  }

  if (!open) {
    return <p className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-600">
      所属がまだありませんか？
      <button type="button" onClick={() => setOpen(true)}
        className="ml-2 font-bold text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
        新しい所属を申請する
      </button>
    </p>;
  }

  return <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
    {issued ? <div>
      <p className="text-sm font-bold text-emerald-800">所属を作成しました</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        下のログイン情報でログインしてください。<b>初期パスワードはこの画面を閉じると二度と表示できません。</b>
        最初のログインのあと、自分のパスワードへの変更が必要です。
      </p>
      <dl className="mt-4 space-y-2 rounded-xl bg-white p-4 text-sm">
        <div className="flex gap-3"><dt className="w-28 shrink-0 text-slate-500">所属コード</dt><dd className="font-bold">{issued.code}</dd></div>
        <div className="flex gap-3"><dt className="w-28 shrink-0 text-slate-500">メールアドレス</dt><dd className="min-w-0 break-all font-bold">{issued.email}</dd></div>
        <div className="flex gap-3"><dt className="w-28 shrink-0 text-slate-500">初期パスワード</dt><dd className="min-w-0 break-all font-mono font-bold">{issued.initialPassword}</dd></div>
      </dl>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
          {copied ? 'コピーしました' : 'ログイン情報をコピー'}
        </button>
        <button type="button" onClick={close} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-slate-400">
          控えたので閉じる
        </button>
      </div>
    </div> : <form onSubmit={submit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-800">新しい所属を申請する</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">管理者アカウントを1つ作成します。先生と生徒は、そのあと管理画面から登録します。</p>
        </div>
        <button type="button" onClick={close} aria-label="申請をやめる" className="shrink-0 rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white hover:text-slate-600">✕</button>
      </div>
      <label className="mt-4 block text-sm font-bold">メールアドレス
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)}
          placeholder="例：admin@example.jp" autoComplete="email" autoCapitalize="none" spellCheck={false}
          className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
      </label>
      <label className="mt-4 block text-sm font-bold">希望する所属コード
        <input required value={code} onChange={(event) => setCode(event.target.value)}
          placeholder="例：sakura-juku" autoComplete="off" autoCapitalize="none" spellCheck={false}
          className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
        <span className="mt-2 block text-xs font-normal text-slate-500">3〜32文字の半角英数字とハイフン。生徒がログインのたびに入力するので、短いものを選んでください。</span>
      </label>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}
      <button disabled={busy} className="mt-5 h-12 w-full rounded-xl bg-emerald-700 font-bold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-50">
        {busy ? '確認中…' : '申請する'}
      </button>
    </form>}
  </div>;
}
