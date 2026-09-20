'use client';
import Link from 'next/link';
import { useState } from 'react';

interface User { id: string; display_name: string; email: string | null; login_identifier?: string | null; role: string; status: 'active' | 'invited' | 'suspended' }
export function UserList({ initial }: { initial: User[] }) {
  const [users, setUsers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function change(id: string, status: User['status']) {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/api/admin/users/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.message ?? '状態を変更できませんでした'); }
      setUsers(current => current.map(user => user.id === id ? { ...user, status } : user));
    } catch (error) { setError(error instanceof Error ? error.message : '通信に失敗しました'); }
    finally { setBusy(null); }
  }
  return <div>
    {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}。保存結果を確認できませんでした。再読み込みして状態を確認してください。</p> : null}
    <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="pb-3">氏名</th><th>ロール</th><th>ログインID / メール</th><th>状態</th><th>操作</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(user => <tr key={user.id}><td className="py-3 font-bold">{user.display_name}</td><td>{user.role}</td><td>{user.login_identifier ?? user.email ?? '—'}</td><td>{({ active: '有効', invited: '招待中', suspended: '停止' })[user.status]}</td><td><Link href={`/admin/users/${user.id}`} className="mr-3 font-bold text-emerald-700 underline">編集</Link><select aria-label={`${user.display_name}の状態`} disabled={busy !== null} value={user.status} onChange={e => change(user.id, e.target.value as User['status'])} className="rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-50"><option value="active">有効</option><option value="invited">招待中</option><option value="suspended">停止</option></select>{busy === user.id ? <span role="status" className="ml-2 text-xs">保存中…</span> : null}</td></tr>)}</tbody></table></div>
  </div>;
}
