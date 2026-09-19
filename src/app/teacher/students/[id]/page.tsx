import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard'; import { assertStudentScope } from '@/lib/auth/student-scope'; import { createClient } from '@/lib/database/server';
import { MetricCard, PageTitle, Panel, ScoreBar } from '@/components/dashboard';

export default async function TeacherStudentPage({ params }: PageProps<'/teacher/students/[id]'>) {
  const context = await requireRole('teacher','admin'); const { id } = await params; await assertStudentScope(context,id); const db = await createClient();
  const [user, profile, assessments] = await Promise.all([db.from('users').select('*').eq('id',id).maybeSingle(), db.from('student_profiles').select('*').eq('user_id',id).maybeSingle(), db.from('assessments').select('*,concepts(name)').eq('student_id',id).order('created_at',{ascending:false})]); if(!user.data) notFound();
  const latest = new Map<string, NonNullable<typeof assessments.data>[number]>(); for(const row of assessments.data??[]) if(!latest.has(row.concept_id)) latest.set(row.concept_id,row); const scores=[...latest.values()].flatMap(v=>v.score===null?[]:[Number(v.override_score??v.score)]);
  return <div><PageTitle eyebrow="Student" title={user.data.display_name} description={`学年 ${profile.data?.grade ?? '未設定'} · 学習傾向は本人と先生が修正できます。`}/><div className="grid gap-4 sm:grid-cols-3"><MetricCard label="平均理解度" value={scores.length?`${Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)}%`:'—'}/><MetricCard label="学習継続" value={`${profile.data?.streak_days??0}日`}/><MetricCard label="現在の難易度" value={`Lv.${profile.data?.current_difficulty??2}`}/></div><div className="mt-6"><Panel title="単元別理解度">{[...latest.values()].map(row=><div key={row.id} className="mb-4 last:mb-0"><p className="mb-2 text-sm font-bold">{row.concepts?.name??'単元'}</p><ScoreBar value={row.override_score??row.score}/></div>)}</Panel></div></div>;
}
