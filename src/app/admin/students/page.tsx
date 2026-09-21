import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel } from '@/components/dashboard';
import { StudentsOverviewTable, type AdminStudentRow } from '@/components/admin/students-overview-table';

export default async function AdminStudentsPage() {
  const context = await requireRole('admin');
  const db = await createClient();
  const [users, profiles, enrollments, progress, assessments, escalations] = await Promise.all([
    db.from('users').select('id,display_name,status').eq('tenant_id', context.tenantId).eq('role', 'student').is('archived_at', null),
    db.from('student_profiles').select('user_id,grade,last_active_on').eq('tenant_id', context.tenantId),
    db.from('enrollments').select('classroom_id,user_id,role,classrooms(name,individual_student_id,archived_at),users!enrollments_user_id_fkey(display_name)')
      .eq('tenant_id', context.tenantId).eq('active', true),
    db.from('assignment_progress').select('student_id,status').eq('tenant_id', context.tenantId),
    db.from('assessments').select('student_id,score,override_score,reviewer_status').eq('tenant_id', context.tenantId).eq('is_final', true),
    db.from('escalations').select('student_id').eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']),
  ]);

  const profileById = new Map((profiles.data ?? []).map((row) => [row.user_id, row]));

  // クラスごとの担当の先生を先に作る。生徒→クラス→先生の順にたどる。
  const teachersByClassroom = new Map<string, string[]>();
  const classroomsByStudent = new Map<string, string[]>();
  for (const row of enrollments.data ?? []) {
    if (row.classrooms?.archived_at) continue;
    if (row.role === 'teacher') {
      teachersByClassroom.set(row.classroom_id, [...(teachersByClassroom.get(row.classroom_id) ?? []), row.users?.display_name ?? '先生']);
    } else if (row.role === 'student') {
      classroomsByStudent.set(row.user_id, [...(classroomsByStudent.get(row.user_id) ?? []), row.classroom_id]);
    }
  }
  const classroomName = new Map((enrollments.data ?? []).flatMap((row) =>
    row.classrooms?.name ? [[row.classroom_id, row.classrooms.name] as const] : []));
  // 個別指導クラスは生徒ごとに1つできる。一覧に並べても情報にならないので名前は出さない。
  const individual = new Set((enrollments.data ?? []).flatMap((row) =>
    row.classrooms?.individual_student_id ? [row.classroom_id] : []));

  const counts = new Map<string, { completed: number; inProgress: number; notStarted: number }>();
  for (const row of progress.data ?? []) {
    const current = counts.get(row.student_id) ?? { completed: 0, inProgress: 0, notStarted: 0 };
    if (row.status === 'completed') current.completed += 1;
    else if (row.status === 'in_progress') current.inProgress += 1;
    else current.notStarted += 1;
    counts.set(row.student_id, current);
  }

  const scores = new Map<string, number[]>();
  for (const row of assessments.data ?? []) {
    if (row.reviewer_status === 'rejected') continue;
    const value = row.override_score ?? row.score;
    if (value === null) continue;
    scores.set(row.student_id, [...(scores.get(row.student_id) ?? []), Number(value)]);
  }

  const followUps = new Map<string, number>();
  for (const row of escalations.data ?? []) {
    if (!row.student_id) continue;
    followUps.set(row.student_id, (followUps.get(row.student_id) ?? 0) + 1);
  }

  const rows: AdminStudentRow[] = (users.data ?? []).map((user) => {
    const classroomIds = classroomsByStudent.get(user.id) ?? [];
    const values = scores.get(user.id) ?? [];
    return {
      id: user.id,
      name: user.display_name,
      status: user.status,
      grade: profileById.get(user.id)?.grade ?? null,
      classrooms: classroomIds.flatMap((id) => individual.has(id) ? [] : [classroomName.get(id) ?? 'クラス']),
      teachers: [...new Set(classroomIds.flatMap((id) => teachersByClassroom.get(id) ?? []))],
      ...(counts.get(user.id) ?? { completed: 0, inProgress: 0, notStarted: 0 }),
      averageScore: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      lastActiveOn: profileById.get(user.id)?.last_active_on ?? null,
      openFollowUps: followUps.get(user.id) ?? 0,
    };
  });

  const unassigned = rows.filter((row) => !row.teachers.length).length;
  const pending = rows.reduce((sum, row) => sum + row.inProgress + row.notStarted, 0);

  return <div>
    <PageTitle title="生徒" description="学校のすべての生徒について、担当・提出状況・理解度をまとめて確認します。" />

    <div className="mb-6 grid gap-4 sm:grid-cols-4">
      <MetricCard label="在籍生徒" value={rows.length} />
      <MetricCard label="担当が未設定" value={unassigned} tone={unassigned ? 'rose' : 'emerald'} note="誰の一覧にも出ません" />
      <MetricCard label="未提出の課題" value={pending} tone={pending ? 'amber' : 'emerald'} note="進行中・未着手の合計" />
      <MetricCard label="要フォロー" value={rows.reduce((sum, row) => sum + row.openFollowUps, 0)} tone="slate" />
    </div>

    <Panel>
      {rows.length ? <StudentsOverviewTable rows={rows} /> : <EmptyState>生徒が登録されていません</EmptyState>}
    </Panel>
  </div>;
}
