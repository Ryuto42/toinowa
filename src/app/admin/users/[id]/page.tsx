import { TeacherAssignment } from '@/components/admin/teacher-assignment';
import { ResourceLifecycle } from '@/components/admin/resource-lifecycle';
import { PasswordReset } from '@/components/admin/password-reset';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle, Panel } from '@/components/dashboard';
import { UserEditForm } from '@/components/admin/user-edit-form';
export default async function EditUserPage({ params }: PageProps<'/admin/users/[id]'>) {
  const context = await requireRole('admin');
  const { id } = await params;
  const db = await createClient();
  const user = await db.from('users').select('id,display_name,email,login_identifier,role,status,archived_at').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
  if (user.error) throw new Error(user.error.message);
  if (!user.data) notFound();
  const profile = user.data.role === 'student' ? await db.from('student_profiles').select('grade,learning_goal,exam_results,weak_areas,daily_time_limit_min').eq('tenant_id', context.tenantId).eq('user_id', id).maybeSingle() : null;
  if (profile?.error) throw new Error(profile.error.message);
  const teachers = user.data.role === 'student' ? await db.from('users').select('id,display_name').eq('tenant_id', context.tenantId).in('role', ['teacher','admin']).eq('status','active') : null;
  const personal = user.data.role === 'student' ? await db.from('classrooms').select('id').eq('tenant_id',context.tenantId).eq('individual_student_id',id).maybeSingle() : null;
  const assigned = personal?.data ? await db.from('enrollments').select('user_id').eq('classroom_id',personal.data.id).eq('role','teacher').eq('active',true) : null;
  for (const result of [teachers,personal,assigned]) if(result?.error) throw new Error(result.error.message);
  return <div><PageTitle title="ユーザー情報を編集" description={`${user.data.display_name}さんの登録情報を更新します。`} />{!user.data.archived_at ? <><Panel title={user.data.role === 'student' ? '基本情報・学習プロフィール' : '基本情報'}><UserEditForm user={user.data} profile={profile?.data ?? null} /></Panel>{user.data.role === 'student' ? <Panel title="個別指導の担当の先生"><TeacherAssignment studentId={id} teachers={(teachers?.data ?? []).map(t => ({id:t.id,name:t.display_name}))} selected={(assigned?.data ?? []).map(e => e.user_id)} /></Panel> : null}<PasswordReset userId={id} name={user.data.display_name} /></> : <p className="mb-6 rounded-xl bg-amber-50 p-5">アーカイブ中です。登録情報・学習履歴は残っています。編集や利用の再開には復元が必要です。</p>}{user.data.role === 'student' ? <ResourceLifecycle kind="student" id={id} archived={!!user.data.archived_at} /> : null}</div>;
}
