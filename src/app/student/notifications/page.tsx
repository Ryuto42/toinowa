import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDateTime } from '@/lib/shared/format';
import { MarkNotificationsRead } from '@/components/student/mark-notifications-read';

export default async function NotificationsPage() {
  const context = await requireRole('student');
  const { data } = await (await createClient())
    .from('notifications').select('*').eq('student_id', context.userId)
    .order('created_at', { ascending: false }).limit(100);
  const items = data ?? [];
  const unread = items.filter((item) => !item.read_at).length;
  return <div>
    <MarkNotificationsRead unread={unread} />
    <PageTitle title="お知らせ" description="復習予定、先生からの返信、学習計画の更新をまとめています。" />
    <Panel title="通知">
      {items.length ? <div className="divide-y divide-slate-100">{items.map((item) => <Link
        href={item.href ?? '/student/home'}
        key={item.id}
        className="block py-4 first:pt-0"
      >
        <div className="flex justify-between gap-3">
          <div>
            <p className="font-bold">{item.title}</p>
            <p className="mt-1 text-sm text-slate-600">{item.body}</p>
            <p className="mt-2 text-xs text-slate-400">{formatDateTime(item.created_at)}</p>
          </div>
          {item.read_at ? null : <StatusPill tone="emerald">新着</StatusPill>}
        </div>
      </Link>)}</div> : <EmptyState>通知はありません</EmptyState>}
    </Panel>
  </div>;
}
