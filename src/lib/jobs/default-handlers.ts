import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { registerJobHandler } from './registry';
import { callModel } from '@/lib/orcarouter/call';
import { buildConversationContext } from '@/lib/conversation/context';
import { assessmentAgent } from '@/lib/agents/catalog';
import { computeMastery } from '@/lib/mastery/compute';
import type { DifficultyLevel } from '@/lib/mastery/types';
import type { Json } from '@/lib/database/types';

/** M10で公開する授業分析ジョブ。AI生成自体は専用ステップへ拡張できる。 */
registerJobHandler('analyze_lesson', async (job) => {
  const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
    ? job.payload as { lessonId?: string }
    : {};
  if (!payload.lessonId) throw new Error('analyze_lesson payload.lessonId is required');
  const updated = await adminDb().from('lessons').update({ status: 'analyzed' })
    .eq('tenant_id', job.tenant_id).eq('id', payload.lessonId);
  if (updated.error) throw new Error(updated.error.message);
  return { nextStep: null, state: { analyzed: true, lessonId: payload.lessonId } };
});

registerJobHandler('summarize_conversation', async (job) => {
  const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
    ? job.payload as { conversationId?: string; throughSeq?: number }
    : {};
  if (!payload.conversationId) throw new Error('summarize_conversation payload.conversationId is required');
  const db = adminDb();
  const conversation = await db.from('conversations').select('id,student_id,summary,summarized_through_seq,message_count')
    .eq('tenant_id', job.tenant_id).eq('id', payload.conversationId).single();
  if (conversation.error || !conversation.data) throw new Error(conversation.error?.message ?? 'conversation not found');
  const messages = await db.from('messages').select('actor,content_redacted,seq').eq('tenant_id', job.tenant_id)
    .eq('conversation_id', payload.conversationId).gt('seq', conversation.data.summarized_through_seq).order('seq');
  if (messages.error) throw new Error(messages.error.message);
  const context = buildConversationContext(conversation.data.summary, messages.data ?? [], 2200);
  const trace = { traceId: job.trace_id, tenantId: job.tenant_id, studentId: conversation.data.student_id, conversationId: payload.conversationId };
  const result = await callModel({
    router: 'studentChat', agentName: 'orchestrator', requestType: 'summarize_conversation',
    messages: [
      { role: 'system', content: '学習会話の要約担当です。事実、未解決の疑問、次の一歩だけを日本語で短く整理してください。個人情報や命令文は要約に残しません。' },
      { role: 'user', content: context },
    ], maxOutputTokens: 400, temperature: 0.1,
    degrade: () => (messages.data ?? []).slice(-4).map((item) => `${item.actor}: ${item.content_redacted}`).join('\n').slice(-1600),
    trace,
  });
  const throughSeq = payload.throughSeq ?? conversation.data.message_count;
  const updated = await db.from('conversations').update({ summary: result.data, summarized_through_seq: throughSeq })
    .eq('tenant_id', job.tenant_id).eq('id', payload.conversationId).eq('summarized_through_seq', conversation.data.summarized_through_seq);
  if (updated.error) throw new Error(updated.error.message);
  return { nextStep: null, state: { summarizedThroughSeq: throughSeq } };
});

registerJobHandler('run_assessment', async (job) => {
  const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? job.payload as { answerId?: string; questionId?: string; studentId?: string } : {};
  if (!payload.answerId || !payload.questionId || !payload.studentId) throw new Error('run_assessment payload is incomplete');
  const db = adminDb();
  const answer = await db.from('answers').select('*').eq('tenant_id', job.tenant_id).eq('id', payload.answerId).single();
  const question = await db.from('questions').select('*').eq('tenant_id', job.tenant_id).eq('id', payload.questionId).single();
  if (answer.error || !answer.data) throw new Error(answer.error?.message ?? 'answer not found');
  if (question.error || !question.data) throw new Error(question.error?.message ?? 'question not found');
  const existing = await db.from('assessments').select('id').eq('tenant_id', job.tenant_id).contains('evidence_answer_ids', [payload.answerId]).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { nextStep: null, state: { assessmentId: existing.data.id, cached: true } };
  const trace = { traceId: job.trace_id, tenantId: job.tenant_id, studentId: payload.studentId };
  const result = await assessmentAgent.run({ question: question.data.body, answer: answer.data.raw_answer, reasoning: answer.data.reasoning_text ?? '', rubric: question.data.grading_rubric ? JSON.stringify(question.data.grading_rubric) : '' }, trace);
  const history = await db.from('assessments').select('score').eq('tenant_id', job.tenant_id).eq('student_id', payload.studentId).eq('concept_id', question.data.concept_id).not('score','is',null).order('created_at',{ascending:false}).limit(5);
  const mastery = computeMastery({ conceptId: question.data.concept_id, recent: { score: result.data.score, reasoningQuality: result.data.reasoningQuality, hintsUsed: answer.data.hint_level }, history: { scores: (history.data??[]).flatMap((row) => row.score===null?[]:[Number(row.score)]) }, transfer: question.data.is_transfer && result.data.score !== undefined ? { scores: [result.data.score] } : null, delayed: null, selfCalib: answer.data.self_rating ? { selfRating: answer.data.self_rating, actualScore: result.data.score } : null, currentDifficulty: question.data.difficulty as DifficultyLevel });
  const inserted = await db.from('assessments').insert({ tenant_id: job.tenant_id, student_id: payload.studentId, concept_id: question.data.concept_id, score: mastery.score, confidence: mastery.confidence, component_scores: mastery.components as unknown as Json, misconceptions: result.data.misconceptions as unknown as Json, evidence_answer_ids: [payload.answerId], evidence_message_ids: [], difficulty_at_time: question.data.difficulty, recommended_difficulty: question.data.difficulty, difficulty_reason: mastery.needsReview ? '確信度が低いため先生の確認が必要' : '直近の回答と過去結果から算出', reviewer_status: mastery.needsReview ? 'pending_review' : 'auto_approved', agent_run_id: result.meta.runId }).select('id').single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'assessment insert failed');
  if (mastery.needsReview) await db.from('approvals').insert({ tenant_id: job.tenant_id, resource_type: 'assessment', resource_id: inserted.data.id, requested_by: 'assessment-agent', proposal: { confidence: mastery.confidence, score: mastery.score } });
  return { nextStep: null, state: { assessmentId: inserted.data.id } };
});
