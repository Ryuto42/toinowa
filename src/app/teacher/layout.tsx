import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';

export default async function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [user, pending, handoffs] = await Promise.all([
    db.from('users').select('display_name').eq('id', context.userId).maybeSingle(),
    db.from('escalations').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']),
    db.from('handoffs').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('to_user', context.userId).eq('status', 'pending'),
  ]);
  return <AppShell roleLabel="先生" userName={user.data?.display_name ?? '先生'} homeHref="/teacher/dashboard" nav={[
    { href: '/teacher/dashboard', label: 'ダッシュボード', icon: 'dashboard' },
    { href: '/teacher/assignments', label: '授業と宿題', icon: 'book' },
    { href: '/teacher/students', label: '生徒', icon: 'users' },
    { href: '/teacher/interventions', label: '要フォロー', icon: 'bolt', badge: pending.count ?? 0 },
    { href: '/teacher/handoffs', label: '引き継ぎ', icon: 'handoff', badge: handoffs.count ?? 0 },
  ]}>{children}</AppShell>;
}
