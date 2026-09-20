import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDateTime } from '@/lib/shared/format';

export default async function AdminHandoffsPage() {
  const context = await requireRole('admin');
  const db = await createClient();
  const [escalations, users, classrooms, enrollments] = await Promise.all([
    db.from('escalations').select('id,student_id,classroom_id,kind,priority,title,status,created_at').eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).order('created_at', { ascending: false }),
    db.from('users').select('id,display_name,role').eq('tenant_id', context.tenantId),
    db.from('classrooms').select('id,name').eq('tenant_id', context.tenantId),
    db.from('enrollments').select('classroom_id,user_id,role').eq('tenant_id', context.tenantId).eq('active', true),
  ]);
  const userById = new Map((users.data ?? []).map((user) => [user.id, user]));
  const classroomById = new Map((classrooms.data ?? []).map((classroom) => [classroom.id, classroom.name]));
  const teacherByClassroom = new Map<string, string[]>();
  for (const enrollment of enrollments.data ?? []) {
    if (enrollment.role !== 'teacher') continue;
    const teacher = userById.get(enrollment.user_id);
    if (!teacher) continue;
    teacherByClassroom.set(enrollment.classroom_id, [...(teacherByClassroom.get(enrollment.classroom_id) ?? []), teacher.display_name]);
  }
  return <div>
    <PageTitle eyebrow="Admin" title="引き継ぎ" description="生徒のつまずきや安全上の確認事項を、担当できる先生と一緒に確認します。" />
    <Panel title="未対応の引き継ぎ">
      {escalations.data?.length ? <div className="space-y-4">{escalations.data.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-wrap items-center gap-2"><StatusPill tone={item.priority === 'urgent' || item.priority === 'high' ? 'rose' : 'amber'}>{item.priority}</StatusPill><StatusPill tone="slate">{item.kind}</StatusPill><span className="text-xs text-slate-500">{formatDateTime(item.created_at)}</span></div><h2 className="mt-3 font-bold">{item.title}</h2><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">生徒</dt><dd className="font-bold">{item.student_id ? userById.get(item.student_id)?.display_name ?? '登録ユーザー' : '未指定'}</dd></div><div><dt className="text-slate-500">クラス</dt><dd className="font-bold">{item.classroom_id ? classroomById.get(item.classroom_id) ?? '登録クラス' : '未指定'}</dd></div><div><dt className="text-slate-500">担当できる先生</dt><dd className="font-bold">{item.classroom_id ? teacherByClassroom.get(item.classroom_id)?.join('、') || '担当未設定' : 'クラス未指定'}</dd></div></dl></article>)}</div> : <EmptyState>未対応の引き継ぎはありません。</EmptyState>}
    </Panel>
  </div>;
}
