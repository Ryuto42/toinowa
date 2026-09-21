import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import type { AuthContext } from '@/lib/auth/guard';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { preCheck, postCheck } from '@/lib/security/guard';
import { enqueueJob, triggerWorkerTick } from '@/lib/jobs/queue';
import type { Channel, MsgActor } from '@/lib/database/types';

export const conversationCreateSchema = z.object({
  studentId: z.uuid().optional(),
  channel: z.literal('web').default('web'),
  externalThreadId: z.string().trim().max(200).optional(),
  lessonId: z.uuid().optional(),
  conceptId: z.uuid().optional(),
  assignmentId: z.uuid().optional(),
});

export const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
  channel: z.literal('web').default('web'),
  channelMessageId: z.string().trim().max(200).optional(),
  stream: z.boolean().default(true),
  assignmentId: z.uuid().optional(),
  questionId: z.uuid().optional(),
  // クライアントが裏で計測した取り組みの様子。欠けていても処理は続ける。
  /** 音声で入力したか。聞き取りの揺れを理由に減点させないために、AIへ伝える。 */
  spoken: z.boolean().optional(),
  telemetry: z.object({
    elapsedSec: z.number().int().min(0).max(24 * 3600).default(0),
    typingMs: z.number().int().min(0).max(24 * 3600 * 1000).default(0),
    keystrokes: z.number().int().min(0).max(100_000).default(0),
    pasteCount: z.number().int().min(0).max(1_000).default(0),
    voiceChunks: z.number().int().min(0).max(1_000).default(0),
    voiceHesitation: z.number().min(0).max(3).default(0),
  }).optional(),
});

export type AnswerTelemetry = NonNullable<z.infer<typeof messageCreateSchema>['telemetry']>;

export async function listConversations(context: AuthContext, studentId?: string) {
  const target = studentId ?? context.userId;
  await assertStudentScope(context, target);
  const { data, error } = await adminDb().from('conversations').select('*')
    .eq('tenant_id', context.tenantId).eq('student_id', target).order('started_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getConversation(context: AuthContext, id: string) {
  const { data, error } = await adminDb().from('conversations').select('*')
    .eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('conversation not found');
  await assertStudentScope(context, data.student_id);
  return data;
}

export async function createConversation(context: AuthContext, input: z.infer<typeof conversationCreateSchema>) {
  const studentId = input.studentId ?? context.userId;
  await assertStudentScope(context, studentId);
  const db = adminDb();

  // 対話相手の設定を切り替えたため、旧コーチ会話とは別スレッドで開始する。
  // 旧履歴は削除せず、現在のワークからは参照しないことで初期状態に戻す。
  const externalThreadId = input.externalThreadId ?? (input.assignmentId ? `assignment:${input.assignmentId}:novice-dialogue-v7` : null);
  if (externalThreadId) {
    const existing = await db.from('conversations').select('*')
      .eq('tenant_id', context.tenantId).eq('student_id', studentId).eq('external_thread_id', externalThreadId)
      // 過去に同じ assignment の会話が複数できている場合は、
      // もっとも履歴が残っているものを優先して対話を再開する。
      .order('message_count', { ascending: false }).order('started_at', { ascending: false }).limit(1);
    if (existing.error) throw new Error(existing.error.message);
    // Reactの開発時再レンダーや過去の試行で同じ外部スレッドが複数作られていても、
    // 最新の会話を再利用してチャットを継続できるようにする。
    if (existing.data?.[0]) return existing.data[0];
  }

  if (context.role === 'student' && !input.assignmentId && (input.lessonId || input.conceptId)) throw new Error('宿題を選択してください');
  let lessonId = input.lessonId ?? null;
  let conceptId = input.conceptId ?? null;
  let openingMessage = '';
  if (input.assignmentId) {
    const assignment = await (await createClient()).from('assignments').select('lesson_id,question_ids')
      .eq('tenant_id', context.tenantId).eq('id', input.assignmentId).maybeSingle();
    if (assignment.error || !assignment.data) throw new Error(assignment.error?.message ?? 'assignment not found');
    lessonId = assignment.data.lesson_id;
    const questionId = assignment.data.question_ids[0];
    if (questionId) {
      const question = await db.from('questions').select('id,concept_id,format,body')
        .eq('tenant_id', context.tenantId).eq('id', questionId).maybeSingle();
      if (question.error || !question.data) throw new Error(question.error?.message ?? 'work prompt not found');
      if (question.data.format !== 'explain') throw new Error('このワークは概念説明形式ではありません');
      conceptId = question.data.concept_id;
      const concept = await db.from('concepts').select('name')
        .eq('tenant_id', context.tenantId).eq('id', question.data.concept_id).maybeSingle();
      const theme = concept.data?.name ?? '学んだ概念';
      openingMessage = [
        '「' + theme + '」について教えてください！',
        question.data.body,
        'まずは、あなたの言葉で教えてほしいな！',
      ].join('\n\n');
    }
  }

  const { data, error } = await db.from('conversations').insert({
    tenant_id: context.tenantId,
    student_id: studentId,
    channel: input.channel,
    external_thread_id: externalThreadId,
    lesson_id: lessonId,
    concept_id: conceptId,
    message_count: openingMessage ? 1 : 0,
  }).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'conversation create failed');
  if (openingMessage) {
    const opening = await db.from('messages').insert({
      tenant_id: context.tenantId,
      conversation_id: data.id,
      seq: 1,
      actor: 'agent',
      content_redacted: openingMessage,
      channel: input.channel,
      safety_flags: {},
    });
    if (opening.error) throw new Error(opening.error.message);
  }
  return data;
}

export async function recordConversationAnswer(input: {
  context: AuthContext;
  conversationId: string;
  assignmentId: string;
  questionId: string;
  answer: string;
  telemetry?: AnswerTelemetry;
}) {
  const db = adminDb();
  const assignment = await (await createClient()).from('assignments').select('id,question_ids')
    .eq('tenant_id', input.context.tenantId).eq('id', input.assignmentId).maybeSingle();
  if (assignment.error || !assignment.data) throw new Error(assignment.error?.message ?? 'assignment not found');
  if (!assignment.data.question_ids.includes(input.questionId)) throw new Error('question is not part of assignment');
  const conversation = await getConversation(input.context, input.conversationId);
  if (conversation.purpose === 'tutorial') throw new Error('練習は採点対象ではありません');
  const question = await db.from('questions').select('id,format,concept_id')
    .eq('tenant_id', input.context.tenantId).eq('id', input.questionId).maybeSingle();
  if (question.error || !question.data) throw new Error(question.error?.message ?? 'work prompt not found');
  if (question.data.concept_id !== conversation.concept_id) throw new Error('この会話のお題ではありません');
  if (question.data.format !== 'explain') throw new Error('このワークは概念説明形式ではありません');
  const inserted = await db.from('answers').insert({
    tenant_id: input.context.tenantId,
    assignment_id: input.assignmentId,
    question_id: input.questionId,
    student_id: input.context.userId,
    conversation_id: input.conversationId,
    raw_answer: input.answer,
    reasoning_text: '',
    hint_level: 0,
    time_spent_sec: input.telemetry?.elapsedSec ?? null,
    typing_ms: input.telemetry?.typingMs ?? null,
    keystrokes: input.telemetry?.keystrokes ?? null,
    paste_count: input.telemetry?.pasteCount ?? 0,
  }).select('*').single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'conversation answer create failed');
  return inserted.data;
}

export async function completeConversation(context: AuthContext, conversationId: string) {
  await getConversation(context, conversationId);
  const db = adminDb();
  const { data, error } = await db.from('conversations').update({
    state: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('tenant_id', context.tenantId).eq('id', conversationId).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('conversation not found');

  if (data.purpose === 'tutorial') return data;

  // 完了時は、途中の回答ではなく会話全体を根拠にした最終分析を必ず作る。
  // 途中で評価モデルは呼ばず、完了後に一度だけ高品質な分析を行う。
  const latestAnswer = await db.from('answers')
    .select('id,question_id,student_id')
    .eq('tenant_id', context.tenantId)
    .eq('conversation_id', conversationId)
    .order('answered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestAnswer.error) throw new Error(latestAnswer.error.message);
  if (latestAnswer.data) {
    const queued = await enqueueJob({
      tenantId: context.tenantId,
      kind: 'run_assessment',
      idempotencyKey: `run_assessment:conversation:${conversationId}:${latestAnswer.data.id}`,
      payload: {
        answerId: latestAnswer.data.id,
        questionId: latestAnswer.data.question_id,
        studentId: latestAnswer.data.student_id,
        conversationId,
        forceHolistic: true,
      },
      priority: 1,
      traceId: crypto.randomUUID(),
    });
    if (!queued) throw new Error('conversation final assessment queue failed');
    triggerWorkerTick();
  }
  return data;
}

export async function listMessages(context: AuthContext, conversationId: string, afterSeq = 0) {
  await getConversation(context, conversationId);
  const { data, error } = await adminDb().from('messages').select('*')
    .eq('tenant_id', context.tenantId).eq('conversation_id', conversationId).gt('seq', afterSeq).order('seq');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function appendMessage(input: {
  context: AuthContext;
  conversationId: string;
  actor: MsgActor;
  content: string;
  channel?: Channel;
  channelMessageId?: string;
}) {
  const conversation = await getConversation(input.context, input.conversationId);
  if (input.actor === 'student' && conversation.student_id !== input.context.userId) {
    await assertStudentScope(input.context, conversation.student_id);
  }
  if (input.channelMessageId) {
    const existing = await adminDb().from('messages').select('*').eq('tenant_id', input.context.tenantId)
      .eq('channel_message_id', input.channelMessageId).maybeSingle();
    if (existing.data) return existing.data;
  }
  let masked = input.content;
  let safetyFlags: Record<string, string[]> = {};
  if (input.actor === 'agent') {
    postCheck(input.content);
  } else {
    const checked = preCheck(input.content);
    masked = checked.masked.text;
    safetyFlags = { pii: checked.inspection.categories };
  }
  const seq = conversation.message_count + 1;
  const { data, error } = await adminDb().from('messages').insert({
    tenant_id: input.context.tenantId,
    conversation_id: input.conversationId,
    seq,
    actor: input.actor,
    content_redacted: masked,
    channel_message_id: input.channelMessageId ?? null,
    channel: input.channel ?? conversation.channel,
    safety_flags: safetyFlags,
  }).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'message create failed');
  await adminDb().from('conversations').update({ message_count: seq }).eq('id', conversation.id)
    .eq('tenant_id', input.context.tenantId).eq('message_count', conversation.message_count);
  return data;
}

export function maybeQueueConversationSummary(input: { tenantId: string; conversationId: string; messageCount: number; traceId: string }): void {
  if (input.messageCount < 20 || input.messageCount % 10 !== 0) return;
  void enqueueJob({
    tenantId: input.tenantId,
    kind: 'summarize_conversation',
    idempotencyKey: `summarize_conversation:${input.conversationId}:${input.messageCount}`,
    payload: { conversationId: input.conversationId, throughSeq: input.messageCount },
    priority: 6,
    traceId: input.traceId,
  }).then(() => triggerWorkerTick());
}

/**
 * 直前の「生徒の送信 → AIの返信」を取り消す。
 *
 * 誤送信の取り返しがつかないと、生徒は書くこと自体をためらう。
 * 取り消せるのは最後の1往復だけで、それより前には戻せない
 * （評価の根拠が後からいくらでも書き換わると、分析が信用できなくなるため）。
 */
export async function undoLastExchange(context: AuthContext, conversationId: string) {
  const conversation = await getConversation(context, conversationId);
  if (conversation.state === 'completed') throw new Error('対話が終わっているため取り消せません');
  // 消せる範囲を関数の中に閉じ込める。アプリ側から seq を指定できないようにするため、
  // messages/answers への DELETE 権限は開けずに RPC 経由でのみ行う。
  const { data, error } = await adminDb().rpc('undo_last_exchange', {
    p_tenant: context.tenantId,
    p_student: conversation.student_id,
    p_conversation: conversationId,
  });
  if (error) throw new Error(error.message);
  const row = (data as unknown as Array<{ restored_text: string | null; removed_count: number | null }> | null)?.[0];
  if (!row) throw new Error('取り消せる送信がありません');
  return { restoredText: row.restored_text ?? '', removedCount: row.removed_count ?? 0 };
}
