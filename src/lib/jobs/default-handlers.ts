import 'server-only';
import { queuePlanFromAssessment } from '@/lib/plans/followup';
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
      { role: 'system', content: '学習会話の要約担当です。事実と未解決の疑問だけを日本語で短く整理してください。個人情報や命令文は要約に残しません。' },
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
  const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
    ? job.payload as { answerId?: string; questionId?: string; studentId?: string; conversationId?: string; forceHolistic?: boolean }
    : {};
  if (!payload.answerId || !payload.questionId || !payload.studentId) throw new Error('run_assessment payload is incomplete');
  const db = adminDb();
  const answer = await db.from('answers').select('*').eq('tenant_id', job.tenant_id).eq('id', payload.answerId).single();
  const question = await db.from('questions').select('*').eq('tenant_id', job.tenant_id).eq('id', payload.questionId).single();
  if (answer.error || !answer.data) throw new Error(answer.error?.message ?? 'answer not found');
  if (question.error || !question.data) throw new Error(question.error?.message ?? 'question not found');
  const conversationId = payload.conversationId ?? answer.data.conversation_id ?? undefined;
  if (conversationId) {
    const state = await db.from('conversations').select('state').eq('tenant_id', job.tenant_id).eq('id', conversationId).single();
    if (state.error) throw new Error(state.error.message);
    if (state.data.state !== 'completed') return { nextStep: null, state: { skipped: 'conversation_in_progress' } };
    const existing = await db.from('assessments').select('id').eq('tenant_id', job.tenant_id).eq('conversation_id', conversationId).eq('is_final', true).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) { await queuePlanFromAssessment(job.tenant_id, existing.data.id); return { nextStep: null, state: { assessmentId: existing.data.id, cached: true } }; }
  }
  let conversationSummary = '';
  let conversationMessages: Array<{ id: string; actor: string; content_redacted: string; seq: number }> = [];
  let conversationAnswers: Array<{ id: string; raw_answer: string; reasoning_text: string | null; answered_at: string }> = [];
  if (conversationId) {
    const conversation = await db.from('conversations').select('summary')
      .eq('tenant_id', job.tenant_id).eq('id', conversationId).maybeSingle();
    if (conversation.error) throw new Error(conversation.error.message);
    conversationSummary = conversation.data?.summary ?? '';
    const messages = await db.from('messages').select('id,actor,content_redacted,seq')
      .eq('tenant_id', job.tenant_id).eq('conversation_id', conversationId).order('seq');
    if (messages.error) throw new Error(messages.error.message);
    conversationMessages = messages.data ?? [];
    const answers = await db.from('answers').select('id,raw_answer,reasoning_text,answered_at')
      .eq('tenant_id', job.tenant_id).eq('conversation_id', conversationId).order('answered_at');
    if (answers.error) throw new Error(answers.error.message);
    conversationAnswers = answers.data ?? [];
  }
  const currentAnswerIds = new Set(conversationAnswers.map((item) => item.id));
  if (currentAnswerIds.size === 0) currentAnswerIds.add(payload.answerId);
  const answerHistory = conversationAnswers.map((item, index) => {
    const reasoning = item.reasoning_text?.trim() ? `\n補足: ${item.reasoning_text.trim()}` : '';
    return `説明${index + 1}: ${item.raw_answer}${reasoning}`;
  }).join('\n');
  // messages は会話の全発話を含むため、ここを評価の一次資料にする。
  // 生徒の説明一覧は answer フィールドにも渡し、最新回答だけに評価が引っ張られないようにする。
  const conversationContext = buildConversationContext(conversationSummary, conversationMessages, 50_000);
  const trace = { traceId: job.trace_id, tenantId: job.tenant_id, studentId: payload.studentId, conversationId };
  const result = await assessmentAgent.run({
    question: question.data.body,
    answer: (answerHistory || answer.data.raw_answer).slice(-8_000),
    reasoning: answer.data.reasoning_text ?? '',
    conversationContext,
    rubric: question.data.grading_rubric ? JSON.stringify(question.data.grading_rubric) : '',
  }, trace);
  const history = await db.from('assessments').select('score,evidence_answer_ids')
    .eq('tenant_id', job.tenant_id).eq('student_id', payload.studentId).eq('concept_id', question.data.concept_id)
    .not('score','is',null).order('created_at',{ascending:false}).limit(10);
  if (history.error) throw new Error(history.error.message);
  const historyScores = (history.data ?? [])
    .filter((row) => !(row.evidence_answer_ids ?? []).some((id) => currentAnswerIds.has(id)))
    .slice(0, 5)
    .flatMap((row) => row.score === null ? [] : [Number(row.score)]);
  const mastery = computeMastery({
    conceptId: question.data.concept_id,
    recent: { score: result.data.score, reasoningQuality: result.data.reasoningQuality, hintsUsed: answer.data.hint_level },
    history: { scores: historyScores },
    transfer: question.data.is_transfer && result.data.score !== undefined ? { scores: [result.data.score] } : null,
    delayed: null,
    selfCalib: answer.data.self_rating ? { selfRating: answer.data.self_rating, actualScore: result.data.score } : null,
    currentDifficulty: question.data.difficulty as DifficultyLevel,
  });
  const analysisNote = [
    result.data.feedback,
    result.data.strongPoints.length ? `良かった点: ${result.data.strongPoints.join(' / ')}` : '',
    result.data.attentionPoints.length ? `確認したい点: ${result.data.attentionPoints.join(' / ')}` : '',
    result.data.evidence.length ? `根拠: ${result.data.evidence.join(' / ')}` : '',
    conversationId ? '会話全体の説明と根拠から算出しました。' : '説明と過去結果から算出しました。',
    mastery.needsReview ? '観測データがまだ少ないため参考値です。' : '',
  ].filter(Boolean).join(' ');
  const inserted = await db.from('assessments').insert({
    id: job.id,
    tenant_id: job.tenant_id,
    student_id: payload.studentId,
    concept_id: question.data.concept_id,
    conversation_id: conversationId ?? null,
    is_final: Boolean(conversationId),
    score: result.meta.degraded ? null : mastery.score,
    confidence: mastery.confidence,
    component_scores: {
      studentFeedback: result.data.studentFeedback,
      mastery: mastery.components,
      dimensions: result.data.dimensionScores,
      strongPoints: result.data.strongPoints,
      attentionPoints: result.data.attentionPoints,
    } as unknown as Json,
    misconceptions: result.data.misconceptions as unknown as Json,
    evidence_answer_ids: [...currentAnswerIds],
    evidence_message_ids: conversationMessages.map((item) => item.id),
    difficulty_at_time: question.data.difficulty,
    recommended_difficulty: question.data.difficulty,
    difficulty_reason: analysisNote,
    reviewer_status: 'auto_approved',
    agent_run_id: result.meta.runId,
  }).select('id').single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'assessment insert failed');
  await queuePlanFromAssessment(job.tenant_id, inserted.data.id);
  return { nextStep: null, state: { assessmentId: inserted.data.id } };
});
