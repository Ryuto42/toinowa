import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const context = await requireRole('admin');
  const user = await (await createClient()).from('users').select('display_name').eq('id', context.userId).maybeSingle();
  return <AppShell roleLabel="管理者" userName={user.data?.display_name ?? '管理者'} homeHref="/admin/overview" nav={[
    { href: '/admin/overview', label: 'ダッシュボード', icon: 'dashboard' },
    { href: '/admin/students', label: '生徒', icon: 'users' },
    { href: '/admin/users', label: 'ユーザー管理', icon: 'key' },
    { href: '/admin/classrooms', label: 'クラス管理', icon: 'book' },
    { href: '/admin/interventions', label: '要フォロー', icon: 'bolt' },
    { href: '/admin/handoffs', label: '引き継ぎ', icon: 'handoff' },
    { href: '/admin/usage', label: 'AI利用状況', icon: 'chart' },
    { href: '/admin/settings', label: '設定', icon: 'settings' },
  ]}>{children}</AppShell>;
}
