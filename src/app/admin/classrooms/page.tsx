import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle, Panel } from '@/components/dashboard';
import { ClassroomManager, CreateClassroom, type ClassroomRow, type MemberOption } from '@/components/admin/classroom-manager';

export default async function AdminClassroomsPage() {
  const context = await requireRole('admin');
  const db = await createClient();
  const [classrooms, users, enrollments] = await Promise.all([
    db.from('classrooms').select('id,name,subject,grade,archived_at').is('individual_student_id',null).eq('tenant_id', context.tenantId).order('name'),
    db.from('users').select('id,display_name,role').eq('tenant_id', context.tenantId)
      .eq('status', 'active').order('role').order('display_name'),
    db.from('enrollments').select('classroom_id,user_id,role')
      .eq('tenant_id', context.tenantId).eq('active', true),
  ]);
  for (const result of [classrooms, users, enrollments]) if (result.error) throw new Error(result.error.message);

  const rows: ClassroomRow[] = (classrooms.data ?? []).map((classroom) => ({
    id: classroom.id,
    name: classroom.name,
    subject: classroom.subject,
    grade: classroom.grade,
    archived_at: classroom.archived_at,
    teacherIds: (enrollments.data ?? [])
      .filter((e) => e.classroom_id === classroom.id && e.role === 'teacher').map((e) => e.user_id),
    studentIds: (enrollments.data ?? [])
      .filter((e) => e.classroom_id === classroom.id && e.role === 'student').map((e) => e.user_id),
  }));

  const members: MemberOption[] = (users.data ?? []).map((user) => ({
    id: user.id, name: user.display_name, role: user.role as MemberOption['role'],
  }));

  const orphanTeachers = members.filter((m) => m.role === 'teacher'
    && !(enrollments.data ?? []).some(e => e.user_id === m.id && e.role === 'teacher'));

  return <div>
    <PageTitle title="クラス管理"
      description="クラスを作り、担当する先生と在籍する生徒を紐付けます。個別指導ではクラスを作らず、ユーザー管理で生徒に担当の先生を設定できます。"
      action={<CreateClassroom />} />
    {orphanTeachers.length ? <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-bold text-amber-900">担当の生徒・クラスが無い先生が{orphanTeachers.length}人います</p>
      <p className="mt-1 text-amber-800">
        {orphanTeachers.map((t) => t.name).join('、')} — このままでは何も表示されません。ユーザー管理で担当の生徒を設定するか、クラスに紐付けてください。
      </p>
    </div> : null}
    <Panel>
      <ClassroomManager classrooms={rows} members={members} />
    </Panel>
  </div>;
}
