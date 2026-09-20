import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { MODEL_TIER } from '@/lib/shared/env.server';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const context = await requireRole('admin');
  const user = await (await createClient()).from('users').select('display_name').eq('id', context.userId).maybeSingle();
  return <AppShell roleLabel="管理者" userName={user.data?.display_name ?? '管理者'} homeHref="/admin/overview" modelTier={MODEL_TIER} nav={[
    { href: '/admin/overview', label: '全体状況', icon: 'dashboard' },
    { href: '/admin/users', label: 'ユーザー管理', icon: 'users' },
    { href: '/admin/handoffs', label: '引き継ぎ', icon: 'bolt' },
    { href: '/admin/usage', label: 'AI利用状況', icon: 'chart' },
  ]}>{children}</AppShell>;
}
