import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { enqueueJob, triggerWorkerTick } from '@/lib/jobs/queue';
import { preCheck } from '@/lib/security/guard';
import { json, parseJson, routeError, traceIdFrom } from '@/lib/api/http';

const schema = z.object({ assignmentId: z.uuid().optional(), questionId: z.uuid(), conversationId: z.uuid().optional(), answer: z.string().trim().min(1).max(8_000), reasoning: z.string().trim().max(8_000).default(''), hintLevel: z.number().int().min(0).max(3).default(0), selfRating: z.number().int().min(1).max(5).optional(), timeSpentSec: z.number().int().min(0).max(86_400).optional() });
export async function POST(request: Request) {
  try {
    const context = await requireRole('student');
    const body = await parseJson(request, schema);
    const db = await createClient();
    if (body.assignmentId) {
      const assignment = await db.from('assignments').select('id,question_ids').eq('tenant_id', context.tenantId).eq('id', body.assignmentId).maybeSingle();
      if (assignment.error) throw new Error(assignment.error.message);
      if (!assignment.data || !assignment.data.question_ids.includes(body.questionId)) return json({ error: 'assignment_not_found' }, { status: 404 });
    }
    const question = await db.from('questions').select('id,concept_id').eq('tenant_id', context.tenantId).eq('id', body.questionId).maybeSingle();
    if (question.error) throw new Error(question.error.message);
    if (!question.data) return json({ error: 'question_not_found' }, { status: 404 });
    if (body.conversationId) {
      const conversation = await db.from('conversations').select('state,concept_id').eq('tenant_id', context.tenantId).eq('student_id', context.userId).eq('id', body.conversationId).maybeSingle();
      if (conversation.error) throw new Error(conversation.error.message);
      if (!conversation.data || conversation.data.concept_id !== question.data.concept_id) return json({ error: 'conversation_not_found' }, { status: 404 });
      if (conversation.data.state === 'completed') return json({ error: 'conversation_completed' }, { status: 409 });
    }
    const answerGuard = preCheck(body.answer);
    const reasoningGuard = body.reasoning ? preCheck(body.reasoning) : null;
    const inserted = await db.from('answers').insert({ tenant_id: context.tenantId, assignment_id: body.assignmentId ?? null, question_id: body.questionId, student_id: context.userId, conversation_id: body.conversationId ?? null, raw_answer: answerGuard.masked.text, reasoning_text: reasoningGuard?.masked.text ?? '', hint_level: body.hintLevel, self_rating: body.selfRating ?? null, time_spent_sec: body.timeSpentSec ?? null }).select('*').single();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'answer create failed');
    // 会話の回答は完了処理がまとめて評価する。途中の回答ごとには採点しない。
    if (!body.conversationId) {
      const job = await enqueueJob({ tenantId: context.tenantId, kind: 'run_assessment', idempotencyKey: `run_assessment:${inserted.data.id}`, payload: { answerId: inserted.data.id, questionId: body.questionId, studentId: context.userId }, priority: 1, traceId: traceIdFrom(request) });
      if (!job) throw new Error('評価を予約できませんでした');
      triggerWorkerTick();
    }
    return json({ accepted: true, answer: inserted.data }, { status: 202 });
  } catch (error) { return routeError(error); }
}
