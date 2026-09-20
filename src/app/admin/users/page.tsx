import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle, Panel } from '@/components/dashboard';
import { UserList } from '@/components/admin/user-list';
import { UserForm } from '@/components/admin/user-form';

export default async function UsersPage() {
  const context = await requireRole('admin');
  const { data, error } = await (await createClient()).from('users').select('id,display_name,email,login_identifier,role,status').eq('tenant_id', context.tenantId).order('role').order('display_name');
  if (error) throw new Error(error.message);
  const classrooms = await (await createClient()).from('classrooms').select('id,name').eq('tenant_id', context.tenantId).order('name');
  if (classrooms.error) throw new Error(classrooms.error.message);
  return <div><PageTitle title="ユーザー管理" description="生徒・先生・管理者の追加と、アクセス状態の変更を行います。" /><UserForm classrooms={classrooms.data ?? []} /><Panel title="登録済みユーザー"><UserList key={(data ?? []).map(user => user.id).join(',')} initial={data ?? []} /></Panel></div>;
}
