import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, PageTitle, Panel, ScoreBar, StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';

export default async function StudentRecordsPage() {
  const context = await requireRole('student');
  const db = await createClient();
  const [assessments, reviews] = await Promise.all([
    db.from('assessments').select('*, concepts(name)').eq('student_id', context.userId).order('created_at', { ascending: false }),
    db.from('review_schedules').select('*, concepts(name)').eq('student_id', context.userId).order('due_at'),
  ]);
  const latest = new Map<string, NonNullable<typeof assessments.data>[number]>();
  for (const item of assessments.data ?? []) if (!latest.has(item.concept_id)) latest.set(item.concept_id, item);
  return <div><PageTitle eyebrow="Records" title="学習記録" description="概念を説明できるようになった度合いと、次に見直すテーマを確認できます。"/><div className="grid gap-6 lg:grid-cols-2"><Panel title="概念説明の評価"><p className="mb-4 text-sm leading-6 text-slate-500">説明の正確さ、論理のつながり、初学者への伝わりやすさをもとにした評価です。</p>{latest.size ? <div className="space-y-5">{[...latest.values()].map((item) => <div key={item.id}><div className="mb-2 flex justify-between"><span className="text-sm font-bold">{item.concepts?.name ?? '概念'}</span>{item.reviewer_status === 'pending_review' ? <StatusPill tone="amber">先生が確認中</StatusPill> : null}</div><ScoreBar value={item.override_score ?? item.score}/>{item.difficulty_reason ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.difficulty_reason}</p> : null}</div>)}</div> : <EmptyState>説明ワークを送信すると評価が表示されます</EmptyState>}</Panel><Panel title="次に見直すテーマ">{reviews.data?.length ? <ul className="space-y-3">{reviews.data.map((item) => <li key={item.id} className="flex justify-between text-sm"><span>{item.concepts?.name ?? '復習テーマ'}</span><span className="text-slate-500">{formatDate(item.due_at)}</span></li>)}</ul> : <EmptyState>見直すテーマはありません</EmptyState>}</Panel></div></div>;
}
