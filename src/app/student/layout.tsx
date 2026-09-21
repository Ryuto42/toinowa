import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';

export default async function StudentLayout({ children }: LayoutProps<'/student'>) {
  const context = await requireRole('student');
  const db = await createClient();
  const [user, unread] = await Promise.all([db.from('users').select('display_name').eq('id', context.userId).maybeSingle(), db.from('notifications').select('id',{count:'exact',head:true}).eq('student_id',context.userId).is('read_at',null)]);
  return <AppShell roleLabel="生徒" userName={user.data?.display_name ?? '生徒'} homeHref="/student/home" nav={[
    { href: '/student/home', label: '今日の学習', icon: 'home' },
    { href: '/student/study', label: 'AIワーク', icon: 'chat' },
    { href: '/student/records', label: 'フィードバック', icon: 'chart' },
    { href: '/student/notifications', label: 'お知らせ', icon: 'bell', badge: unread.count ?? 0 },
  ]}>{children}</AppShell>;
}
