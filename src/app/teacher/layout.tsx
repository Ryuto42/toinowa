import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { seenAtFor } from '@/lib/nav/seen';

export default async function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  // 「未対応の件数」ではなく「最後に開いてから増えた件数」を出す。
  // 対応済みにするまで赤い数字が残り続けると、見ても消えないので誰も見なくなる。
  const seen = await seenAtFor(context.userId, ['teacher_assignments', 'teacher_interventions', 'teacher_handoffs']);
  const [user, pending, handoffs, drafts] = await Promise.all([
    db.from('users').select('display_name').eq('id', context.userId).maybeSingle(),
    db.from('escalations').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).gt('created_at', seen.teacher_interventions),
    db.from('handoffs').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('to_user', context.userId).eq('status', 'pending').gt('created_at', seen.teacher_handoffs),
    db.from('assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('status', 'draft').gt('created_at', seen.teacher_assignments),
  ]);
  return <AppShell role="teacher" userName={user.data?.display_name ?? '先生'} homeHref="/teacher/dashboard" nav={[
    { href: '/teacher/dashboard', label: 'ダッシュボード', icon: 'dashboard' },
    { href: '/teacher/assignments', label: '課題', icon: 'book', badge: drafts.count ?? 0, badgeKey: 'teacher_assignments' },
    { href: '/teacher/students', label: '生徒', icon: 'users' },
    { href: '/teacher/interventions', label: '要フォロー', icon: 'bolt', badge: pending.count ?? 0, badgeKey: 'teacher_interventions' },
    { href: '/teacher/handoffs', label: '引き継ぎ', icon: 'handoff', badge: handoffs.count ?? 0, badgeKey: 'teacher_handoffs' },
  ]}>{children}</AppShell>;
}
