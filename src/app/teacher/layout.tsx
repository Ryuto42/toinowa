import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { MODEL_TIER } from '@/lib/shared/env.server';

export default async function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [user, pending] = await Promise.all([
    db.from('users').select('display_name').eq('id', context.userId).maybeSingle(),
    db.from('approvals').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).is('decision', null),
  ]);
  return <AppShell roleLabel="先生" userName={user.data?.display_name ?? '先生'} homeHref="/teacher/dashboard" modelTier={MODEL_TIER} nav={[
    { href: '/teacher/dashboard', label: 'ダッシュボード' }, { href: '/teacher/lessons', label: '授業' },
    { href: '/teacher/students', label: '生徒' }, { href: '/teacher/interventions', label: '介入' },
    { href: '/teacher/approvals', label: '承認', badge: pending.count ?? 0 }, { href: '/teacher/ops', label: 'AI運用' },
  ]}>{children}</AppShell>;
}
