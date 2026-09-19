import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

export default async function TeacherLessonPage({ params }: PageProps<'/teacher/lessons/[id]'>) {
  const context = await requireRole('teacher', 'admin'); const { id } = await params; const db = await createClient();
  const lesson = await db.from('lessons').select('*, classrooms(name), concepts(*), materials(*)').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
  if (!lesson.data) notFound();
  return <div><PageTitle eyebrow="Lesson" title={lesson.data.title} description={`${lesson.data.classrooms?.name} · ${formatDate(lesson.data.taught_at)}`} action={<StatusPill tone={lesson.data.status === 'published' ? 'emerald' : 'blue'}>{lesson.data.status}</StatusPill>}/><div className="grid gap-6 lg:grid-cols-2"><Panel title="学習目標">{Array.isArray(lesson.data.objectives) && lesson.data.objectives.length ? <ul className="list-disc space-y-2 pl-5 text-sm">{lesson.data.objectives.map((value, i) => <li key={i}>{String(value)}</li>)}</ul> : <EmptyState>学習目標が未登録です</EmptyState>}</Panel><Panel title="教材">{lesson.data.materials?.length ? <ul className="space-y-2 text-sm">{lesson.data.materials.map((item) => <li key={item.id} className="flex justify-between"><span>{item.filename}</span><StatusPill tone={item.ingest_status === 'done' ? 'emerald' : 'amber'}>{item.ingest_status}</StatusPill></li>)}</ul> : <EmptyState>教材は任意です。未登録でも授業分析を開始できます。</EmptyState>}</Panel><Panel title="対象単元">{lesson.data.concepts?.length ? <div className="space-y-3">{lesson.data.concepts.map((item) => <article key={item.id} className="rounded-xl bg-slate-50 p-3"><p className="font-bold">{item.name}</p><p className="mt-1 text-sm text-slate-500">{item.description}</p></article>)}</div> : <EmptyState>AI分析後に単元候補が表示されます</EmptyState>}</Panel><Panel title="次の操作"><div className="space-y-3 text-sm"><p>分析ジョブを開始すると、教材と学習目標から単元候補を作ります。</p><form action={`/api/lessons/${id}/analyze`} method="post"><button className="rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white">授業を分析</button></form></div></Panel></div></div>;
}
