import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { seenAtFor } from '@/lib/nav/seen';

export default async function StudentLayout({ children }: LayoutProps<'/student'>) {
  const context = await requireRole('student');
  const db = await createClient();
  const seen = await seenAtFor(context.userId, ['student_study', 'student_records']);
  const [user, unread, works, feedback] = await Promise.all([
    db.from('users').select('display_name').eq('id', context.userId).maybeSingle(),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('student_id', context.userId).is('read_at', null),
    db.from('assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('status', 'published').gt('created_at', seen.student_study),
    db.from('assessments').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('student_id', context.userId).gt('created_at', seen.student_records),
  ]);
  return <AppShell role="student" userName={user.data?.display_name ?? '生徒'} homeHref="/student/home" nav={[
    { href: '/student/home', label: '今日の学習', icon: 'home' },
    { href: '/student/study', label: '課題', icon: 'chat', badge: works.count ?? 0, badgeKey: 'student_study' },
    { href: '/student/records', label: 'フィードバック', icon: 'chart', badge: feedback.count ?? 0, badgeKey: 'student_records' },
    { href: '/student/notifications', label: 'お知らせ', icon: 'bell', badge: unread.count ?? 0 },
  ]}>{children}</AppShell>;
}
