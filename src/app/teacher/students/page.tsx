import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';

const STATUS_LABELS: Record<string, string> = { active: '在籍中', suspended: '停止中', invited: '招待済み' };

export default async function TeacherStudentsPage() {
  const context = await requireRole('teacher', 'admin');
  const { data, error } = await (await createClient())
    .from('enrollments')
    .select('id,classroom_id,user:users!enrollments_user_id_fkey(id,display_name,status,archived_at),classroom:classrooms(name,archived_at)')
    .eq('tenant_id', context.tenantId).eq('role', 'student').eq('active', true);

  if(error) throw new Error(error.message);
  // 生徒が複数クラスに在籍していても1行にまとめる。在籍行をそのまま並べると同じ生徒が何度も出る。
  const students = new Map<string, { id: string; name: string; status: string; classrooms: string[] }>();
  for (const row of data ?? []) {
    if (!row.user?.id || row.user.archived_at || row.classroom?.archived_at) continue;
    const current = students.get(row.user.id) ?? { id: row.user.id, name: row.user.display_name, status: row.user.status, classrooms: [] };
    if (row.classroom?.name) current.classrooms.push(row.classroom.name);
    students.set(row.user.id, current);
  }
  const list = [...students.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return <div>
    <PageTitle title="生徒" description="個別に担当する生徒と、担当クラスの生徒が表示されます。" />
    <Panel title="在籍生徒" description={list.length ? `${list.length}名` : undefined}>
      {list.length ? <div className="divide-y divide-slate-100">{list.map((student) => <Link
        key={student.id}
        href={`/teacher/students/${student.id}`}
        className="flex items-center justify-between gap-4 py-4 first:pt-0"
      >
        <div className="min-w-0">
          <p className="font-bold">{student.name}</p>
          <p className="mt-1 truncate text-sm text-slate-500">{student.classrooms.join(' · ') || 'クラス未設定'}</p>
        </div>
        <StatusPill tone={student.status === 'active' ? 'emerald' : 'amber'}>{STATUS_LABELS[student.status] ?? student.status}</StatusPill>
      </Link>)}</div> : <EmptyState>担当の生徒はいません。管理者に担当の設定を依頼してください。</EmptyState>}
    </Panel>
  </div>;
}
