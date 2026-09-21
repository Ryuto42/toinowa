'use client';
import { useState } from 'react';
export interface Credentials { organizationCode: string; loginIdentifier: string; initialPassword: string }
export function CredentialsReceipt({ credentials, onClose }: { credentials: Credentials; onClose: () => void }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(`所属コード: ${credentials.organizationCode}\nメールアドレス / ログインID: ${credentials.loginIdentifier}\n初期パスワード: ${credentials.initialPassword}`); setMessage('コピーしました'); }
    catch { setMessage('コピーできませんでした。表示された情報を選択してコピーしてください。'); }
  }
  return <div className="mt-5 rounded-xl border border-emerald-300 bg-white p-5"><p className="font-bold">ログイン情報</p><p className="mt-2 text-sm">本人へ渡す情報を控えてください。初期パスワードはこの画面を閉じると再表示できません。</p><dl className="mt-3 space-y-2 text-sm"><div><dt className="font-bold">所属コード</dt><dd className="select-all break-all font-mono">{credentials.organizationCode}</dd></div><div><dt className="font-bold">メールアドレス / ログインID</dt><dd className="select-all break-all font-mono">{credentials.loginIdentifier}</dd></div><div><dt className="font-bold">初期パスワード</dt><dd className="select-all break-all font-mono">{credentials.initialPassword}</dd></div></dl><p className="mt-3 text-sm text-slate-600">次回ログイン後、本人にパスワードの変更を求めます。</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={copy} className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white">ログイン情報をコピー</button><button type="button" onClick={onClose} className="text-sm font-bold text-emerald-700 underline">控えたので閉じる</button></div><p role="status" className="mt-2 text-sm">{message}</p></div>;
}
