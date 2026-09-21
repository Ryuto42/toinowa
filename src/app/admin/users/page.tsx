import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle, Panel } from '@/components/dashboard';
import { UserList } from '@/components/admin/user-list';
import { UserForm } from '@/components/admin/user-form';

export default async function UsersPage() {
  const context = await requireRole('admin');
  const { data, error } = await (await createClient()).from('users').select('id,display_name,email,login_identifier,role,status,archived_at').eq('tenant_id', context.tenantId).order('role').order('display_name');
  if (error) throw new Error(error.message);
  const classrooms = await (await createClient()).from('classrooms').select('id,name').eq('tenant_id', context.tenantId).is('individual_student_id', null).is('archived_at', null).order('name');
  if (classrooms.error) throw new Error(classrooms.error.message);
  return <div><PageTitle title="ユーザー管理" description="生徒・先生・管理者の追加と、アクセス状態の変更を行います。" /><UserForm classrooms={classrooms.data ?? []} teachers={(data ?? []).filter(user => user.role !== 'student' && user.status === 'active').map(user => ({ id: user.id, name: user.display_name }))} /><Panel title="登録済みユーザー"><UserList key={(data ?? []).map(user => `${user.id}:${user.status}:${user.archived_at}`).join(',')} initial={data ?? []} /></Panel></div>;
}
