import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { LessonForm } from '@/components/teacher/lesson-form';
import { formatDate } from '@/lib/shared/format';

export default async function TeacherLessonsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const [lessons, classrooms] = await Promise.all([db.from('lessons').select('*, classrooms(name), concepts(id)').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }), db.from('classrooms').select('id,name').eq('tenant_id', context.tenantId)]);
  return <div><PageTitle eyebrow="Lessons" title="授業管理" description="授業内容を登録し、分析・問題作成・承認へ進めます。" action={<LessonForm classrooms={classrooms.data ?? []}/>}/><Panel title="授業一覧">{lessons.data?.length ? <div className="divide-y divide-slate-100">{lessons.data.map((lesson) => <Link href={`/teacher/lessons/${lesson.id}`} key={lesson.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-bold">{lesson.title}</p><p className="mt-1 text-sm text-slate-500">{lesson.classrooms?.name} · {formatDate(lesson.taught_at)} · {lesson.concepts?.length ?? 0}単元</p></div><StatusPill tone={lesson.status === 'published' ? 'emerald' : lesson.status === 'analyzed' ? 'blue' : 'slate'}>{lesson.status}</StatusPill></Link>)}</div> : <EmptyState>最初の授業を登録してください</EmptyState>}</Panel></div>;
}
