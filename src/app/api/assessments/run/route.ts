import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { adminDb } from '@/lib/database/admin';
import { assessmentAgent } from '@/lib/agents/catalog';
import { computeMastery } from '@/lib/mastery/compute';
import type { DifficultyLevel } from '@/lib/mastery/types';
import type { Json } from '@/lib/database/types';
import { json, parseJson, routeError, traceIdFrom } from '@/lib/api/http';

const schema = z.object({
  studentId: z.uuid().optional(),
  conceptId: z.uuid(),
  question: z.string().min(1).max(8_000),
  answer: z.string().min(1).max(8_000),
  reasoning: z.string().max(8_000).default(''),
  rubric: z.string().max(8_000).default(''),
  evidenceMessageIds: z.array(z.uuid()).max(20).default([]),
  evidenceAnswerIds: z.array(z.uuid()).max(20).default([]),
  answerId: z.uuid().optional(),
  difficulty: z.number().int().min(1).max(5).default(2),
  hintsUsed: z.number().int().min(0).max(3).default(0),
  selfRating: z.number().int().min(1).max(5).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher', 'admin');
    const body = await parseJson(request, schema);
    const studentId = body.studentId ?? context.userId;
    await assertStudentScope(context, studentId);
    if (body.answerId) {
      const cached = await adminDb().from('assessments').select('*')
        .eq('tenant_id', context.tenantId).eq('student_id', studentId).eq('concept_id', body.conceptId)
        .contains('evidence_answer_ids', [body.answerId]).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (cached.error) throw new Error(cached.error.message);
      if (cached.data) return json({ assessment: cached.data, cached: true });
    }
    const traceId = traceIdFrom(request);
    const result = await assessmentAgent.run({
      question: body.question,
      answer: body.answer,
      reasoning: body.reasoning,
      conversationContext: '',
      rubric: body.rubric,
    }, { traceId, tenantId: context.tenantId, studentId, userId: context.userId });

    const historyQuery = await adminDb().from('assessments').select('score')
      .eq('tenant_id', context.tenantId).eq('student_id', studentId).eq('concept_id', body.conceptId)
      .not('score', 'is', null).order('created_at', { ascending: false }).limit(5);
    if (historyQuery.error) throw new Error(historyQuery.error.message);
    const mastery = computeMastery({
      conceptId: body.conceptId,
      recent: { score: result.data.score, reasoningQuality: result.data.reasoningQuality, hintsUsed: body.hintsUsed },
      history: { scores: (historyQuery.data ?? []).flatMap((row) => row.score === null ? [] : [Number(row.score)]) },
      transfer: null,
      delayed: null,
      selfCalib: body.selfRating ? { selfRating: body.selfRating, actualScore: result.data.score } : null,
      currentDifficulty: body.difficulty as DifficultyLevel,
    });
    const analysisNote = [
      result.data.feedback,
      result.data.strongPoints.length ? `良かった点: ${result.data.strongPoints.join(' / ')}` : '',
      result.data.attentionPoints.length ? `確認したい点: ${result.data.attentionPoints.join(' / ')}` : '',
      result.data.evidence.length ? `根拠: ${result.data.evidence.join(' / ')}` : '',
      mastery.needsReview ? '観測データがまだ少ないため参考値です。' : '直近の説明と過去結果から算出しました。',
    ].filter(Boolean).join(' ');
    const inserted = await adminDb().from('assessments').insert({
      tenant_id: context.tenantId,
      student_id: studentId,
      concept_id: body.conceptId,
      score: mastery.score,
      confidence: mastery.confidence,
      component_scores: {
        mastery: mastery.components,
        dimensions: result.data.dimensionScores,
        strongPoints: result.data.strongPoints,
        attentionPoints: result.data.attentionPoints,
      } as unknown as Json,
      misconceptions: result.data.misconceptions as unknown as Json,
      evidence_message_ids: body.evidenceMessageIds,
      evidence_answer_ids: body.evidenceAnswerIds,
      difficulty_at_time: body.difficulty,
      difficulty_reason: analysisNote,
      reviewer_status: 'auto_approved',
      agent_run_id: result.meta.runId,
    }).select('*').single();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'assessment insert failed');
    return json({ assessment: inserted.data, feedback: result.data.feedback, mastery }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
