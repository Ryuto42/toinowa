import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';

export default async function TeacherStudentsPage() {
  const context = await requireRole('teacher', 'admin');
  const { data } = await (await createClient()).from('enrollments').select('id,classroom_id,user:users!enrollments_user_id_fkey(id,display_name,status),classroom:classrooms(name)').eq('tenant_id', context.tenantId).eq('role', 'student').eq('active', true);
  return <div><PageTitle eyebrow="Students" title="生徒" description="担当クラスの生徒だけが表示されます。"/><Panel title="在籍生徒">{data?.length ? <div className="divide-y divide-slate-100">{data.map((item) => <Link key={item.id} href={`/teacher/students/${item.user?.id}`} className="flex items-center justify-between py-4 first:pt-0"><div><p className="font-bold">{item.user?.display_name}</p><p className="mt-1 text-sm text-slate-500">{item.classroom?.name}</p></div><StatusPill tone={item.user?.status === 'active' ? 'emerald' : 'amber'}>{item.user?.status}</StatusPill></Link>)}</div> : <EmptyState>担当クラスの生徒はいません</EmptyState>}</Panel></div>;
}
