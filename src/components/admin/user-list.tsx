'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';

interface User { archived_at?: string | null; id: string; display_name: string; email: string | null; login_identifier?: string | null; role: string; status: 'active' | 'invited' | 'suspended' }

const ROLE_LABELS: Record<string, string> = { student: '生徒', teacher: '先生', admin: '管理者' };
const STATUS_LABELS: Record<string, string> = { active: '有効', invited: '招待中', suspended: '停止' };

export function UserList({ initial }: { initial: User[] }) {
  const [users, setUsers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
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

  const rows = users.filter(user => showArchived || !user.archived_at);

  return <div>
    {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}。保存結果を確認できませんでした。再読み込みして状態を確認してください。</p> : null}
    <DataTable
      rows={rows}
      getKey={user => user.id}
      searchIn={user => `${user.display_name} ${user.login_identifier ?? ''} ${user.email ?? ''}`}
      searchPlaceholder="氏名・ログインID・メールで検索"
      unit="人"
      empty="該当するユーザーはいません"
      initialSort={{ key: 'name' }}
      filters={[
        { key: 'role', label: 'ロール', options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })), match: (user, value) => user.role === value },
        { key: 'status', label: '状態', options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })), match: (user, value) => !user.archived_at && user.status === value },
      ]}
      toolbar={<label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />アーカイブ済みも表示
      </label>}
      columns={[
        { key: 'name', label: '氏名', sortBy: user => user.display_name, render: user => <span className="font-bold">{user.display_name}</span> },
        { key: 'role', label: 'ロール', sortBy: user => ROLE_LABELS[user.role] ?? user.role, render: user => ROLE_LABELS[user.role] ?? user.role },
        { key: 'login', label: 'ログインID / メール', sortBy: user => user.login_identifier ?? user.email, hideOnMobile: true, render: user => user.login_identifier ?? user.email ?? '—' },
        { key: 'status', label: '状態', sortBy: user => user.archived_at ? 'アーカイブ中' : STATUS_LABELS[user.status] ?? user.status, render: user => user.archived_at ? 'アーカイブ中' : STATUS_LABELS[user.status] ?? user.status },
        { key: 'actions', label: '操作', render: user => <span className="flex items-center gap-3 whitespace-nowrap">
          <Link href={`/admin/users/${user.id}`} className="font-bold text-emerald-700 underline">編集</Link>
          <select aria-label={`${user.display_name}の状態`} disabled={busy !== null || !!user.archived_at} value={user.status}
            onChange={event => change(user.id, event.target.value as User['status'])}
            className="rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-50">
            <option value="active">有効</option><option value="invited">招待中</option><option value="suspended">停止</option>
          </select>
          {busy === user.id ? <span role="status" className="text-xs">保存中…</span> : null}
        </span> },
      ]}
    />
  </div>;
}
