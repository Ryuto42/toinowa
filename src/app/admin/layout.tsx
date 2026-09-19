import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { MODEL_TIER } from '@/lib/shared/env.server';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const context = await requireRole('admin');
  const user = await (await createClient()).from('users').select('display_name').eq('id', context.userId).maybeSingle();
  return <AppShell roleLabel="管理者" userName={user.data?.display_name ?? '管理者'} homeHref="/admin/tenant" modelTier={MODEL_TIER} nav={[
    { href: '/admin/tenant', label: '学校設定' }, { href: '/admin/users', label: 'ユーザー' },
    { href: '/admin/line', label: 'LINE連携' }, { href: '/admin/retention', label: 'データ保持' },
    { href: '/admin/limits', label: '利用上限' }, { href: '/admin/audit', label: '監査ログ' }, { href: '/admin/usage', label: '利用状況' },
  ]}>{children}</AppShell>;
}
