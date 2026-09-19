import { requireAuth } from '@/lib/auth/guard';
import { json, parseJson, routeError, traceIdFrom, uuidParam } from '@/lib/api/http';
import { appendMessage, getConversation, listMessages, messageCreateSchema, maybeQueueConversationSummary } from '@/lib/conversation/service';
import { buildConversationContext } from '@/lib/conversation/context';
import { fastPathMessage, routeConversation } from '@/lib/agents/orchestrator';
import { learningSupportAgent } from '@/lib/agents/catalog';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, route: Context) {
  try {
    const context = await requireAuth();
    const conversationId = uuidParam((await route.params).id);
    const afterSeq = Number(new URL(request.url).searchParams.get('afterSeq') ?? 0);
    return json({ messages: await listMessages(context, conversationId, Number.isFinite(afterSeq) ? afterSeq : 0) });
  } catch (error) {
    return routeError(error);
  }
}

function eventStream(payload: { message: string; traceId: string; runId?: string }) {
  const encoder = new TextEncoder();
  const chunks = payload.message.match(/.{1,24}/gu) ?? [payload.message];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(payload)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireAuth();
    const conversationId = uuidParam((await route.params).id);
    const body = await parseJson(request, messageCreateSchema);
    const conversation = await getConversation(context, conversationId);
    await appendMessage({
      context,
      conversationId,
      actor: context.role === 'student' ? 'student' : 'teacher',
      content: body.content,
      channel: body.channel,
      channelMessageId: body.channelMessageId,
    });

    const traceId = traceIdFrom(request);
    const decision = routeConversation({ message: body.content, state: conversation.state, channel: body.channel });
    let message = fastPathMessage(decision.intent);
    let runId: string | undefined;
    if (!message) {
      const recent = await listMessages(context, conversationId, Math.max(0, conversation.message_count - 10));
      const result = await learningSupportAgent.run({
        studentMessage: body.content,
        context: buildConversationContext(conversation.summary, recent),
        hintLevel: decision.intent === 'hint' ? 1 : 0,
      }, {
        traceId,
        tenantId: context.tenantId,
        studentId: conversation.student_id,
        conversationId,
        userId: context.userId,
      });
      message = result.data.message;
      runId = result.meta.runId;
    }
    await appendMessage({ context, conversationId, actor: 'agent', content: message, channel: body.channel });
    maybeQueueConversationSummary({ tenantId: context.tenantId, conversationId, messageCount: conversation.message_count + 2, traceId });
    const payload = { message, traceId, runId, decision };
    return body.stream ? eventStream(payload) : json(payload);
  } catch (error) {
    return routeError(error);
  }
}
