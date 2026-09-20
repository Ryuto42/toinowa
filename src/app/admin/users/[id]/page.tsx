import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle, Panel } from '@/components/dashboard';
import { UserEditForm } from '@/components/admin/user-edit-form';
export default async function EditUserPage({ params }: PageProps<'/admin/users/[id]'>) {
  const context = await requireRole('admin');
  const { id } = await params;
  const db = await createClient();
  const user = await db.from('users').select('id,display_name,email,login_identifier,role,status').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
  if (user.error) throw new Error(user.error.message);
  if (!user.data) notFound();
  const profile = user.data.role === 'student' ? await db.from('student_profiles').select('grade,learning_goal,exam_results,weak_areas,daily_time_limit_min').eq('tenant_id', context.tenantId).eq('user_id', id).maybeSingle() : null;
  if (profile?.error) throw new Error(profile.error.message);
  return <div><PageTitle title="ユーザー情報を編集" description={`${user.data.display_name}さんの登録情報を更新します。`} /><Panel title={user.data.role === 'student' ? '基本情報・学習プロフィール' : '基本情報'}><UserEditForm user={user.data} profile={profile?.data ?? null} /></Panel></div>;
}
