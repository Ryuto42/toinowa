import 'server-only';
import { z } from 'zod';
import { adminDb } from '@/lib/database/admin';
import type { AuthContext } from '@/lib/auth/guard';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { preCheck, postCheck } from '@/lib/security/guard';
import { enqueueJob, triggerWorkerTick } from '@/lib/jobs/queue';
import type { Channel, MsgActor } from '@/lib/database/types';

export const conversationCreateSchema = z.object({
  studentId: z.uuid().optional(),
  channel: z.enum(['web', 'line']).default('web'),
  externalThreadId: z.string().trim().max(200).optional(),
  lessonId: z.uuid().optional(),
  conceptId: z.uuid().optional(),
});

export const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
  channel: z.enum(['web', 'line']).default('web'),
  channelMessageId: z.string().trim().max(200).optional(),
  stream: z.boolean().default(true),
});

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
  const student = await adminDb().from('users').select('id,role,tenant_id').eq('id', studentId)
    .eq('tenant_id', context.tenantId).eq('role', 'student').maybeSingle();
  if (student.error || !student.data) throw new Error('student not found');
  const { data, error } = await adminDb().from('conversations').insert({
    tenant_id: context.tenantId,
    student_id: studentId,
    channel: input.channel,
    external_thread_id: input.externalThreadId ?? null,
    lesson_id: input.lessonId ?? null,
    concept_id: input.conceptId ?? null,
  }).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'conversation create failed');
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
