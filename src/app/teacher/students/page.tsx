import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel } from '@/components/dashboard';
import { StudentsTable } from '@/components/teacher/students-table';

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
    <Panel>
      {list.length
        ? <StudentsTable rows={list} />
        : <EmptyState>担当の生徒はいません。管理者に担当の設定を依頼してください。</EmptyState>}
    </Panel>
  </div>;
}
