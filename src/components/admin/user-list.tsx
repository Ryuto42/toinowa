'use client';
import { useState } from 'react';
import { UserEditDialog } from './user-edit-dialog';
import { DataTable } from '@/components/data-table';

interface User { archived_at?: string | null; id: string; display_name: string; email: string | null; login_identifier?: string | null; role: string; status: 'active' | 'invited' | 'suspended' }

const ROLE_LABELS: Record<string, string> = { student: '生徒', teacher: '先生', admin: '管理者' };
const STATUS_LABELS: Record<string, string> = { active: '有効', invited: '招待中', suspended: '停止' };

export function UserList({ initial }: { initial: User[] }) {
  const [showArchived, setShowArchived] = useState(false);

  const rows = initial.filter(user => showArchived || !user.archived_at);

  return <DataTable
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
        { key: 'actions', label: '操作', align: 'right', render: user => <span className="flex items-center justify-end">
          <UserEditDialog userId={user.id} name={user.display_name} />
        </span> },
      ]}
    />;
}
