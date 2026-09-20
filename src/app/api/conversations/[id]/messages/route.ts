import { requireAuth } from '@/lib/auth/guard';
import { json, parseJson, routeError, traceIdFrom, uuidParam } from '@/lib/api/http';
import { appendMessage, completeConversation, getConversation, listMessages, messageCreateSchema, maybeQueueConversationSummary, recordConversationAnswer } from '@/lib/conversation/service';
import { buildConversationContext } from '@/lib/conversation/context';
import { fastPathMessage, routeConversation } from '@/lib/agents/orchestrator';
import { learningSupportAgent } from '@/lib/agents/catalog';

type Context = { params: Promise<{ id: string }> };
const MAX_EXPLANATION_TURNS = 6;
const FOCUS_BY_TURN = ['relationship', 'example', 'boundary', 'summary', 'finish'] as const;

function focusForTurn(studentTurn: number): typeof FOCUS_BY_TURN[number] {
  return FOCUS_BY_TURN[Math.min(Math.max(studentTurn - 1, 0), FOCUS_BY_TURN.length - 1)];
}

function normalizedQuestion(text: string): string {
  return text.toLocaleLowerCase().replace(/[\s「」『』。、，,！？!?：:…]/gu, '');
}

function hasRepeatedQuestion(message: string, previousMessages: Array<{ actor: string; content_redacted: string }>): boolean {
  const currentQuestions = message.split(/[！？!?]/u).map(normalizedQuestion).filter((text) => text.length >= 10);
  if (!currentQuestions.length) return false;
  const previousQuestions = previousMessages
    .filter((item) => item.actor === 'agent')
    .flatMap((item) => item.content_redacted.split(/[！？!?]/u).map(normalizedQuestion))
    .filter((text) => text.length >= 10);
  return currentQuestions.some((current) => previousQuestions.some((previous) => (
    current === previous || (current.length >= 16 && previous.length >= 16 && (current.includes(previous) || previous.includes(current)))
  )));
}

function fallbackQuestion(focus: typeof FOCUS_BY_TURN[number]): string {
  switch (focus) {
    case 'relationship': return '切片で場所、傾きで向きを決めると、どうして一本の線になるのかな？';
    case 'example': return '身近なたとえを、もう一つだけ教えてほしいな！';
    case 'boundary': return '傾きが0やマイナスのとき、グラフはどう変わるのかな？';
    case 'summary': return '最後に、この概念をひとことでまとめて教えてほしいな！';
    case 'finish': return '教えてくれてありがとう！';
  }
}

function questionMatchesFocus(message: string, focus: typeof FOCUS_BY_TURN[number]): boolean {
  const text = normalizedQuestion(message);
  if (focus === 'relationship') return /(関係|つなが|一緒|決ま|形)/u.test(text);
  if (focus === 'example') return /(例|たとえ|身近|具体)/u.test(text);
  if (focus === 'boundary') return /(0|ゼロ|マイナス|負|変わ|水平|上|下|増|減)/u.test(text);
  if (focus === 'summary') return /(まとめ|ひとこと|一言|要約)/u.test(text);
  return false;
}

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

function eventStream(payload: { message: string; traceId: string; runId?: string; conversationCompleted?: boolean; understandingLevel?: number }) {
  const encoder = new TextEncoder();
  // 改行も含めて分割し、AIの段落をチャット画面で保つ。
  const chunks = payload.message.match(/[\s\S]{1,24}/gu) ?? [payload.message];
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
    if (conversation.state === 'completed') {
      return json({ message: 'この対話はここで完了しました。' }, { status: 409 });
    }
    const studentMessage = await appendMessage({
      context,
      conversationId,
      actor: context.role === 'student' ? 'student' : 'teacher',
      content: body.content,
      channel: body.channel,
      channelMessageId: body.channelMessageId,
    });
    if (context.role === 'student' && body.assignmentId && body.questionId) {
      await recordConversationAnswer({
        context,
        conversationId,
        assignmentId: body.assignmentId,
        questionId: body.questionId,
        answer: studentMessage.content_redacted,
      });
    }

    const traceId = traceIdFrom(request);
    const fullMessages = await listMessages(context, conversationId, 0);
    const studentTurn = fullMessages.filter((item) => item.actor === 'student').length;
    const atMaxTurns = studentTurn >= MAX_EXPLANATION_TURNS;
    const requiredFocus = focusForTurn(studentTurn);
    const decision = routeConversation({ message: body.content, state: conversation.state, channel: body.channel });
    let message: string = fastPathMessage(decision.intent) ?? '';
    let runId: string | undefined;
    let understandingLevel: number | undefined;
    let conversationCompleted = atMaxTurns;
    if (!message && !atMaxTurns) {
      const result = await learningSupportAgent.run({
        studentMessage: body.content,
        context: buildConversationContext(conversation.summary, fullMessages, 8000),
        hintLevel: decision.intent === 'hint' ? 1 : 0,
        studentTurn,
        maxTurns: MAX_EXPLANATION_TURNS,
        requiredFocus,
      }, {
        traceId,
        tenantId: context.tenantId,
        studentId: conversation.student_id,
        conversationId,
        userId: context.userId,
      });
      message = result.data.message;
      runId = result.meta.runId;
      understandingLevel = result.data.understandingLevel;
      conversationCompleted = conversationCompleted || result.data.shouldFinish || requiredFocus === 'finish';
      if (!result.data.shouldFinish && (
        hasRepeatedQuestion(message, fullMessages)
        || !/[?？]/u.test(message)
        || !questionMatchesFocus(message, requiredFocus)
      )) {
        message = fallbackQuestion(requiredFocus);
      }
    }
    if (atMaxTurns) {
      const percentage = understandingLevel === undefined ? '' : `だいたい${Math.round(understandingLevel * 100)}%くらい`;
      message = `ここまでで、わたしはこのテーマを${percentage || 'だいぶ'}理解できたよ！教えてくれてありがとう。`;
    }
    await appendMessage({ context, conversationId, actor: 'agent', content: message, channel: body.channel });
    if (conversationCompleted) await completeConversation(context, conversationId);
    maybeQueueConversationSummary({ tenantId: context.tenantId, conversationId, messageCount: conversation.message_count + 2, traceId });
    const payload = { message, traceId, runId, decision, conversationCompleted, understandingLevel };
    return body.stream ? eventStream(payload) : json(payload);
  } catch (error) {
    return routeError(error);
  }
}
