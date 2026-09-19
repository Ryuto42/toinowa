import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';

export default async function StudentLayout({ children }: LayoutProps<'/student'>) {
  const context = await requireRole('student');
  const db = await createClient();
  const [user, unread] = await Promise.all([db.from('users').select('display_name').eq('id', context.userId).maybeSingle(), db.from('notifications').select('id',{count:'exact',head:true}).eq('student_id',context.userId).is('read_at',null)]);
  return <AppShell roleLabel="生徒" userName={user.data?.display_name ?? '生徒'} homeHref="/student/home" nav={[
    { href: '/student/home', label: '今日の学習' }, { href: '/student/study', label: '課題' },
    { href: '/student/records', label: '学習記録' }, { href: '/student/notifications', label: 'お知らせ', badge: unread.count??0 }, { href: '/student/settings', label: '設定' },
  ]}>{children}</AppShell>;
}
