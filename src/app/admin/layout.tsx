import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { seenAtFor } from '@/lib/nav/seen';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const context = await requireRole('admin');
  const db = await createClient();
  const seen = await seenAtFor(context.userId, ['admin_interventions', 'admin_handoffs']);
  const [user, pending, handoffs] = await Promise.all([
    db.from('users').select('display_name').eq('id', context.userId).maybeSingle(),
    db.from('escalations').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).gt('created_at', seen.admin_interventions),
    db.from('handoffs').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('status', 'pending').gt('created_at', seen.admin_handoffs),
  ]);
  return <AppShell role="admin" userName={user.data?.display_name ?? '管理者'} homeHref="/admin/overview" nav={[
    { href: '/admin/overview', label: 'ダッシュボード', icon: 'dashboard' },
    { href: '/admin/students', label: '生徒', icon: 'users' },
    { href: '/admin/users', label: 'ユーザー管理', icon: 'key' },
    { href: '/admin/classrooms', label: 'クラス管理', icon: 'book' },
    { href: '/admin/interventions', label: '要フォロー', icon: 'bolt', badge: pending.count ?? 0, badgeKey: 'admin_interventions' },
    { href: '/admin/handoffs', label: '引き継ぎ', icon: 'handoff', badge: handoffs.count ?? 0, badgeKey: 'admin_handoffs' },
    { href: '/admin/usage', label: 'AI利用状況', icon: 'chart' },
    { href: '/admin/settings', label: '設定', icon: 'settings' },
  ]}>{children}</AppShell>;
}
