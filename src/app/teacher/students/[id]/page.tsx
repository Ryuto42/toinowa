import { AssessmentOverride } from '@/components/teacher/assessment-override';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel, ScoreBar, StatusPill } from '@/components/dashboard';
import { formatDate, formatDateTime } from '@/lib/shared/format';

function jsonItems(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

const dimensionLabels: Record<string, string> = {
  definition: '概念の定義',
  logic: '論理のつながり',
  example: '具体例・たとえ',
  accuracy: '正確さ',
  clarity: '初学者への伝わりやすさ',
};

const masteryLabels: Record<string, string> = {
  recent: '今回の説明',
  history: '過去の説明',
  transfer: '応用への転移',
  delayed: '時間を置いた定着',
  selfCalib: '自己評価との一致',
};

export default async function TeacherStudentPage({ params }: PageProps<'/teacher/students/[id]'>) {
  const context = await requireRole('teacher', 'admin');
  const { id } = await params;
  await assertStudentScope(context, id);
  const db = await createClient();
  const [user, profile, assessments, plans, reviews, answers, questions, escalations] = await Promise.all([
    db.from('users').select('*').eq('id', id).maybeSingle(),
    db.from('student_profiles').select('*').eq('user_id', id).maybeSingle(),
    db.from('assessments').select('*,concepts(name)').eq('student_id', id).eq('is_final', true).order('created_at', { ascending: false }),
    db.from('learning_plans').select('*').eq('student_id', id).order('created_at', { ascending: false }).limit(3),
    db.from('review_schedules').select('*,concepts(name)').eq('student_id', id).is('fulfilled_at', null).order('due_at').limit(8),
    db.from('answers').select('id,question_id,conversation_id,raw_answer,reasoning_text,hint_level,self_rating,time_spent_sec,answered_at').eq('student_id', id).order('answered_at', { ascending: false }).limit(100),
    db.from('questions').select('id,body').eq('tenant_id', context.tenantId),
    db.from('escalations').select('id,title,kind,priority,status,resolution_note,created_at').eq('tenant_id', context.tenantId).eq('student_id', id).order('created_at', { ascending: false }).limit(5),
  ]);
  for (const result of [user, profile, assessments, plans, reviews, answers, questions, escalations]) if (result.error) throw new Error(result.error.message);
  if (!user.data) notFound();

  const latest = new Map<string, NonNullable<typeof assessments.data>[number]>();
  for (const row of assessments.data ?? []) if (!latest.has(row.concept_id)) latest.set(row.concept_id, row);
  const scores = [...latest.values()].flatMap(row => row.reviewer_status === 'rejected' || row.reviewer_status === 'pending_review' || (row.override_score ?? row.score) === null ? [] : [Number(row.override_score ?? row.score)]);
  const orderedAssessments = [...latest.values()].sort((a, b) => Number(b.reviewer_status === 'pending_review') - Number(a.reviewer_status === 'pending_review'));
  const pendingCount = orderedAssessments.filter(item => item.reviewer_status === 'pending_review').length;
  const questionById = new Map((questions.data ?? []).map((question) => [question.id, question.body]));
  const currentPlan = plans.data?.[0];
  const evidenceMessageIds = [...new Set([...latest.values()].flatMap((item) => item.evidence_message_ids ?? []))];
  const evidenceMessagesQuery = evidenceMessageIds.length
    ? await db.from('messages').select('id,conversation_id,seq,actor,content_redacted,created_at').eq('tenant_id', context.tenantId).in('id', evidenceMessageIds).order('seq')
    : { data: [] as Array<{ id: string; conversation_id: string; seq: number; actor: string; content_redacted: string; created_at: string }> };
  const answerById = new Map((answers.data ?? []).map((answer) => [answer.id, answer]));
  const messageById = new Map((evidenceMessagesQuery.data ?? []).map((message) => [message.id, message]));
  const recentAnswers = (answers.data ?? []).slice(0, 8);

  return <div>
    <PageTitle eyebrow="Student feedback" title={user.data.display_name} description={`学年 ${profile.data?.grade ?? '未設定'}。概念説明のAI評価、説明の根拠、次に学ぶ単元をまとめています。`} />
<div className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm leading-7"><p><strong>目標：</strong>{profile.data?.learning_goal || '未設定'}</p><p><strong>苦手な範囲：</strong>{profile.data?.weak_areas || '未設定'}</p><details><summary className="cursor-pointer">登録時の模試結果</summary><p className="whitespace-pre-wrap">{profile.data?.exam_results || '未登録'}</p></details></div>
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="確認済みの平均理解度" value={scores.length ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100)}%` : '—'} /><MetricCard label="学習継続" value={`${profile.data?.streak_days ?? 0}日`} /><MetricCard label="現在の難易度" value={`Lv.${profile.data?.current_difficulty ?? 2}`} /></div>

    {pendingCount ? <div role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">先生の確認が必要な概念が{pendingCount}件あります</p><p className="mt-1">下の一覧では確認待ちを先頭にしています。根拠となった発言と要確認点を見て、評価を修正できます。</p></div> : null}
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="概念説明とAI評価" description="会話全体から、先生が確認しやすい根拠と観点別の分析を表示します。">
        {latest.size ? <div className="space-y-6">{orderedAssessments.map((item) => {
          const detail = jsonRecord(item.component_scores);
          const dimensions = jsonRecord(detail.dimensions);
          const mastery = Array.isArray(item.component_scores) ? item.component_scores : detail.mastery;
          const evidenceAnswers = (item.evidence_answer_ids ?? []).map((answerId) => answerById.get(answerId)).filter((answer): answer is NonNullable<typeof answers.data>[number] => Boolean(answer));
          const evidenceMessages = (item.evidence_message_ids ?? []).map((messageId) => messageById.get(messageId)).filter((message): message is NonNullable<typeof evidenceMessagesQuery.data>[number] => Boolean(message));
          const strongPoints = stringItems(detail.strongPoints);
          const attentionPoints = stringItems(detail.attentionPoints);
          const masteryItems = jsonItems(mastery);
          return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3"><p className="font-bold">{item.concepts?.name ?? '概念'}</p><StatusPill tone={item.reviewer_status === 'rejected' ? 'rose' : item.reviewer_status === 'pending_review' ? 'amber' : 'emerald'}>{({ pending_review: '確認が必要', auto_approved: '自動分析済み', approved: '先生が確認済み', rejected: '却下済み', overridden: '先生が修正済み' })[item.reviewer_status]}</StatusPill></div>
            <div className="mt-3"><ScoreBar value={item.reviewer_status === 'rejected' ? null : item.override_score ?? item.score} /></div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">評価根拠の充足度</dt><dd className="font-bold">{Math.round(Number(item.confidence) * 100)}%</dd></div><div><dt className="text-slate-500">評価日時</dt><dd className="font-bold">{formatDateTime(item.created_at)}</dd></div></dl>
            <div className="mt-5 rounded-xl bg-[#f7faf9] p-4"><p className="font-bold text-[#17233d]">AIによる分析（先生の修正前）</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.difficulty_reason ?? '記録なし'}</p></div>
            {item.score !== null && item.reviewer_status !== 'rejected' && Object.keys(dimensions).length ? <div className="mt-5"><p className="font-bold">観点別の理解度</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(dimensionLabels).map(([key, label]) => <div key={key}><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="font-bold">{Math.round(Number(dimensions[key] ?? 0) * 100)}%</span></div><ScoreBar value={typeof dimensions[key] === 'number' ? dimensions[key] as number : Number(dimensions[key] ?? 0)} /></div>)}</div></div> : null}
            {masteryItems.length ? <details className="mt-5 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-bold">理解度の計算に使った観測</summary><div className="mt-3 space-y-3">{masteryItems.map((component, index) => <div key={index} className="flex items-center justify-between gap-3 text-sm"><span>{masteryLabels[String(component.key)] ?? String(component.key ?? '観測')}</span><span className="font-bold">{Math.round(Number(component.raw ?? 0) * 100)}%</span></div>)}</div></details> : null}
            {strongPoints.length ? <div className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-bold">できていたこと</p><ul className="mt-1 list-disc pl-5">{strongPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></div> : null}
            {attentionPoints.length ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">次に確認したいこと</p><ul className="mt-1 list-disc pl-5">{attentionPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></div> : null}
            {jsonItems(item.misconceptions).length ? <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900"><p className="font-bold">説明に出ていた誤解・要確認点</p><ul className="mt-1 space-y-2">{jsonItems(item.misconceptions).map((misconception, index) => <li key={index}><span className="font-bold">{String(misconception.label ?? misconception.code ?? '確認項目')}</span>{misconception.evidence ? <span className="mt-1 block">根拠: {String(misconception.evidence)}</span> : null}</li>)}</ul></div> : null}
            {evidenceAnswers.length ? <div className="mt-5"><p className="font-bold">分析に使った生徒の説明</p><div className="mt-3 space-y-3">{evidenceAnswers.map((answer, index) => <div key={answer.id} className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-bold text-slate-500">説明 {index + 1}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{answer.raw_answer}</p>{answer.reasoning_text ? <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-500">補足: {answer.reasoning_text}</p> : null}</div>)}</div></div> : null}
            {evidenceMessages.length ? <details open className="mt-5 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-bold">AIとの会話の根拠（{evidenceMessages.length}件）</summary><div className="mt-3 space-y-2">{evidenceMessages.map((message) => <div key={message.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="text-xs font-bold text-slate-500">{message.actor === 'student' ? '生徒' : 'AI'} ・ {message.seq}番目</p><p className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">{message.content_redacted}</p></div>)}</div></details> : null}
            {item.override_note ? <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm"><p className="font-bold">先生の判断・修正理由</p><p className="mt-1 whitespace-pre-wrap">{item.override_note}</p></div> : null}
            {item.score === null ? <p className="mt-3 text-sm text-amber-800">AIが評価を確定できなかったため、点数・観点別評価は未判定です。</p> : null}
            <AssessmentOverride assessmentId={item.id} initialScore={item.override_score ?? item.score} />
          </article>;
        })}</div> : <EmptyState>説明を送信するとAI評価が表示されます。</EmptyState>}
      </Panel>
      <Panel title="今後の学習" description="AIが提案した次の単元と、先生が確認すべき復習予定です。">
        {currentPlan ? <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold">学習計画 {formatDate(currentPlan.period_start)}〜{formatDate(currentPlan.period_end)}</p><StatusPill tone={currentPlan.status === 'active' || currentPlan.status === 'approved' ? 'emerald' : 'amber'}>{currentPlan.status === 'pending_review' ? '先生の確認待ち' : '学習計画'}</StatusPill></div><p className="mt-3 text-sm leading-6 text-slate-600">{currentPlan.rationale || '提案理由はまだありません。'}</p><ol className="mt-4 space-y-3">{jsonItems(currentPlan.tasks).map((task, index) => <li key={index} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-bold">{index + 1}. {String(task.concept ?? '学習テーマ')}</p><p className="mt-1 whitespace-pre-wrap leading-6">{String(task.prompt ?? task.goal ?? '')}</p><p className="mt-2 text-xs text-slate-500">難易度 Lv.{String(task.difficulty ?? '—')} ・ 目安 {String(task.est_min ?? '—')}分</p></li>)}</ol></div> : <EmptyState>学習計画はまだありません。</EmptyState>}
        <div className="mt-4">{reviews.data?.length ? <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{reviews.data.map((review) => <li key={review.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="font-semibold">{review.concepts?.name ?? '復習単元'}</span><span className="text-slate-500">{formatDate(review.due_at)}</span></li>)}</ul> : <p className="text-sm text-slate-500">復習予定はありません。</p>}</div>
      </Panel>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="直近の説明" description="生徒が概念をどう説明したかを確認できます.">
        {recentAnswers.length ? <div className="space-y-3">{recentAnswers.map((answer) => <article key={answer.id} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-bold">{questionById.get(answer.question_id) ?? '説明テーマ'}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{answer.raw_answer}</p>{answer.reasoning_text ? <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">具体例・たとえ・補足</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{answer.reasoning_text}</p></div> : null}<p className="mt-3 text-xs text-slate-500">説明日時 {formatDateTime(answer.answered_at)}</p></article>)}</div> : <EmptyState>まだ説明はありません。</EmptyState>}
      </Panel>
      <Panel title="引き継ぎ" description="先生が確認・対応する必要がある項目です.">
        {escalations.data?.length ? <div className="space-y-3">{escalations.data.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2"><StatusPill tone={item.priority === 'urgent' || item.priority === 'high' ? 'rose' : 'amber'}>{item.priority}</StatusPill><StatusPill tone={item.status === 'resolved' ? 'emerald' : 'amber'}>{item.status}</StatusPill></div><p className="mt-2 font-bold">{item.title}</p>{item.resolution_note ? <p className="mt-2 text-sm text-slate-600">{item.resolution_note}</p> : null}</article>)}</div> : <EmptyState>引き継ぎ項目はありません。</EmptyState>}
      </Panel>
    </div>
  </div>;
}
