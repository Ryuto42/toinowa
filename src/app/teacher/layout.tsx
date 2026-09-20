import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';

export default async function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [user, pending] = await Promise.all([
    db.from('users').select('display_name').eq('id', context.userId).maybeSingle(),
    db.from('escalations').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']),
  ]);
  return <AppShell roleLabel="先生" userName={user.data?.display_name ?? '先生'} homeHref="/teacher/dashboard" nav={[
    { href: '/teacher/dashboard', label: 'ダッシュボード', icon: 'dashboard' },
    { href: '/teacher/assignments', label: '説明ワーク', icon: 'book' },
    { href: '/teacher/students', label: '生徒', icon: 'users' },
    { href: '/teacher/interventions', label: '介入', icon: 'bolt', badge: pending.count ?? 0 },
  ]}>{children}</AppShell>;
}
