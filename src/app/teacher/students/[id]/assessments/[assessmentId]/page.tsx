import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { EmptyState, PageTitle, Panel, StatusPill } from '@/components/dashboard';
import { formatDateTime } from '@/lib/shared/format';
import { AssessmentOverride } from '@/components/teacher/assessment-override';
import { AnswerIntegrity } from '@/components/teacher/answer-integrity';
import {
  DimensionBars, MASTERY_LABELS, MisconceptionChips, PointChips, ScoreRing,
  jsonItems, jsonRecord, stringItems,
} from '@/components/teacher/analysis';

const REVIEW_LABELS: Record<string, string> = {
  pending_review: '確認が必要', auto_approved: '自動分析済み', approved: '先生が確認済み',
  rejected: '却下済み', overridden: '先生が修正済み',
};

export default async function AssessmentDetailPage({ params }: PageProps<'/teacher/students/[id]/assessments/[assessmentId]'>) {
  const context = await requireRole('teacher', 'admin');
  const { id, assessmentId } = await params;
  await assertStudentScope(context, id);
  const db = await createClient();

  const assessment = await db.from('assessments')
    .select('*,concepts(name,description)')
    .eq('tenant_id', context.tenantId).eq('id', assessmentId).eq('student_id', id).maybeSingle();
  if (assessment.error) throw new Error(assessment.error.message);
  if (!assessment.data) notFound();
  const row = assessment.data;

  const [answers, messages, student] = await Promise.all([
    row.evidence_answer_ids?.length
      ? db.from('answers').select('id,raw_answer,reasoning_text,answered_at,time_spent_sec,ai_likelihood,ai_signals').in('id', row.evidence_answer_ids).order('answered_at')
      : Promise.resolve({ data: [], error: null }),
    row.evidence_message_ids?.length
      ? adminDb().from('messages').select('id,actor,content_redacted,seq').in('id', row.evidence_message_ids).order('seq')
      : Promise.resolve({ data: [], error: null }),
    db.from('users').select('display_name').eq('id', id).maybeSingle(),
  ]);

  const detail = jsonRecord(row.component_scores);
  const dimensions = jsonRecord(detail.dimensions);
  const masteryItems = jsonItems(Array.isArray(row.component_scores) ? row.component_scores : detail.mastery);
  const score = row.reviewer_status === 'rejected' ? null : row.override_score ?? row.score;
  const confidence = Math.round(Number(row.confidence) * 100);

  return <div>
    <p className="mb-3 text-sm">
      <Link href={`/teacher/students/${id}`} className="font-bold text-[#237d75]">‹ {student.data?.display_name ?? '生徒'}の学習記録へ戻る</Link>
    </p>
    <PageTitle
      title={row.concepts?.name ?? '概念'}
      description={`${formatDateTime(row.created_at)} の提出に対する分析です。`}
      action={<StatusPill tone={row.reviewer_status === 'pending_review' ? 'amber' : row.reviewer_status === 'overridden' ? 'blue' : 'emerald'}>
        {REVIEW_LABELS[row.reviewer_status] ?? row.reviewer_status}
      </StatusPill>}
    />

    {row.reviewer_status === 'pending_review' ? <div role="status" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">
      観測が少なく、AIの確信度は{confidence}%です。根拠を見て、必要なら下で点数を修正してください。
    </div> : null}

    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <Panel title="この説明の評価">
        <ScoreRing value={score === null ? null : Number(score)} size={112}
          caption={`AIが根拠にできた情報の充足度 ${confidence}%`} />
        {row.override_note ? <div className="mt-5 rounded-lg bg-[#e8f8f3] p-3 text-sm">
          <p className="font-bold text-[#1c6e60]">先生の判断</p>
          <p className="mt-1 whitespace-pre-wrap leading-7">{row.override_note}</p>
        </div> : null}
        <AssessmentOverride assessmentId={row.id} initialScore={score === null ? null : Number(score)} />
      </Panel>

      <Panel title="観点別の内訳">
        {Object.keys(dimensions).length ? <DimensionBars dimensions={dimensions} /> : <EmptyState>観点別の分析はありません</EmptyState>}
        <div className="mt-6 space-y-4">
          <div>
            <p className="mb-2 text-sm font-bold text-[#1c6e60]">できていたこと</p>
            <PointChips items={stringItems(detail.strongPoints)} tone="good" />
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-[#8a5e12]">次に確認したいこと</p>
            <PointChips items={stringItems(detail.attentionPoints)} tone="attention" />
          </div>
          {jsonItems(row.misconceptions).length ? <div>
            <p className="mb-2 text-sm font-bold text-[#8f3b46]">説明に出ていたつまずき</p>
            <MisconceptionChips items={jsonItems(row.misconceptions)} />
          </div> : null}
        </div>
      </Panel>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="生徒が書いた説明" description="分析の根拠にした提出です">
        {answers.data?.length ? <div className="space-y-3">{answers.data.map((answer, index) => <div key={answer.id} className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-500">説明 {index + 1}{answer.time_spent_sec ? ` ・ ${answer.time_spent_sec}秒` : ''}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer.raw_answer}</p>
          <AnswerIntegrity likelihood={answer.ai_likelihood === null ? null : Number(answer.ai_likelihood)} signals={answer.ai_signals} />
        </div>)}</div> : <EmptyState>根拠にした説明はありません</EmptyState>}
      </Panel>

      <div className="space-y-6">
        {masteryItems.length ? <Panel title="理解度の計算に使った観測" description="どの材料がどれだけ効いたか">
          <DimensionBars
            dimensions={Object.fromEntries(masteryItems.map((item) => [String(item.key), Number(item.raw ?? 0)]))}
            labels={Object.fromEntries(masteryItems.map((item) => [String(item.key), MASTERY_LABELS[String(item.key)] ?? String(item.key)]))}
          />
        </Panel> : null}

        <Panel title="AIの所見" description="点数の根拠を文章で残しています">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-[#237d75]">全文を読む</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{row.difficulty_reason ?? '記録なし'}</p>
          </details>
        </Panel>

        {messages.data?.length ? <Panel title="AIとの会話" description={`${messages.data.length}件`}>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-[#237d75]">やり取りを見る</summary>
            <div className="mt-3 space-y-2">{messages.data.map((message) => <div key={message.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-xs font-bold text-slate-500">{message.actor === 'student' ? '生徒' : 'AI'} ・ {message.seq}番目</p>
              <p className="mt-1 whitespace-pre-wrap leading-7 text-slate-700">{message.content_redacted}</p>
            </div>)}</div>
          </details>
        </Panel> : null}
      </div>
    </div>
  </div>;
}
