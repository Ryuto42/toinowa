import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { assertStudentScope } from '@/lib/auth/student-scope';

export default async function StudentDetailLayout({ children, params }: LayoutProps<'/teacher/students/[id]'>) {
  const context = await requireRole('teacher', 'admin'); const { id } = await params; await assertStudentScope(context, id);
  const tabs = [['概要', ''], ['回答', '/answers'], ['会話', '/conversations'], ['学習計画', '/plan']];
  return <div><nav className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-200">{tabs.map(([label, suffix]) => <Link key={label} href={`/teacher/students/${id}${suffix}`} className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-bold text-slate-600 hover:border-emerald-600 hover:text-emerald-700">{label}</Link>)}</nav>{children}</div>;
}
