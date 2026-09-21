import { studentTutorialAudience } from '@/lib/tutorial/student';
import { composeTutorialReply } from '@/lib/tutorial/flow';
import { tutorialAgent } from '@/lib/tutorial/agent';
import { TUTORIAL_FINISH, TUTORIAL_STOP_MESSAGE } from '@/lib/tutorial/content';
import { requireAuth } from '@/lib/auth/guard';
import { ForbiddenError } from '@/lib/auth/errors';
import { json, parseJson, routeError, traceIdFrom, uuidParam } from '@/lib/api/http';
import { appendMessage, completeConversation, getConversation, listMessages, messageCreateSchema, maybeQueueConversationSummary, recordConversationAnswer } from '@/lib/conversation/service';
import { buildConversationContext } from '@/lib/conversation/context';
import { fastPathMessage, routeConversation } from '@/lib/agents/orchestrator';
import { after } from 'next/server';
import { adminDb } from '@/lib/database/admin';
import { recordAnswerIntegrity } from '@/lib/integrity/record';
import { classroomOfStudent, raiseEscalation } from '@/lib/interventions/raise';
import { reportSafetyBlock } from '@/lib/security/escalate';
import { SafetyBlocked } from '@/lib/orcarouter/errors';
import { activeCare, canResumeLearning, carePriority, careReply, careTag, CARE_TITLES, isLearningMessage, type CareDecision } from '@/lib/security/student-care';
import { classifyStudentCare } from '@/lib/security/student-care-agent';
import { preCheck } from '@/lib/security/guard';
import { recordGuardEvent } from '@/lib/security/audit';
import { classForDifficulty } from '@/lib/orcarouter/selection';
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
    case 'relationship': return '今教えてくれたことは、どうつながっているのかな？';
    case 'example': return '身近なたとえを、もう一つだけ教えてほしいな！';
    case 'boundary': return 'その説明が当てはまらない場合もあるのかな？';
    case 'summary': return '最後に、この概念をひとことでまとめて教えてほしいな！';
    case 'finish': return '教えてくれてありがとう！';
  }
}

export async function GET(request: Request, route: Context) {
  try {
    const context = await requireAuth();
    const conversationId = uuidParam((await route.params).id);
    const afterSeq = Number(new URL(request.url).searchParams.get('afterSeq') ?? 0);
    return json({ messages: await listMessages(context, conversationId, Number.isFinite(afterSeq) ? afterSeq : 0) });
  } catch (error) {
    // 危険な入力を遮断したときは、遮断して終わりにせず先生へ上げる。
    // 生徒が困っている合図かもしれず、放置してよい種類の失敗ではない。
    // モデル呼び出しの中で遮断されたぶんは call.ts が記録済み。
    // ここで拾うのは、呼び出し前の preCheck で止めた入力。
    if (error instanceof SafetyBlocked) {
      const context = await requireAuth().catch(() => null);
      if (context) {
        const { tenantId, role, userId } = context;
        after(() => reportSafetyBlock({
          error,
          tenantId,
          studentId: role === 'student' ? userId : null,
          escalate: role === 'student',
        }));
      }
    }
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
    if (conversation.purpose === 'tutorial' && (context.role !== 'student' || conversation.student_id !== context.userId)) {
      throw new ForbiddenError('この練習に回答できるのは生徒本人だけです');
    }
    if (conversation.state === 'completed') {
      return json({ message: 'この対話はここで完了しました。' }, { status: 409 });
    }
    const traceId = traceIdFrom(request);
    const previousMessages = await listMessages(context, conversationId);
    const paused = context.role === 'student' ? activeCare(previousMessages) : null;
    // 学力の回答として保存する前に、相談・暴言への対応を決める。
    const care = context.role === 'student' && !(conversation.purpose === 'tutorial' && !paused && body.content === TUTORIAL_STOP_MESSAGE)
      ? await classifyStudentCare(preCheck(body.content).masked.text, previousMessages, {
        traceId, tenantId: context.tenantId, studentId: context.userId, userId: context.userId, conversationId,
      }) : null;
    const resume = Boolean(paused && care && canResumeLearning(care));
    const category: CareDecision['category'] = paused && !resume && (!care || care.category === 'normal' || care.category === 'hostility' || care.category === 'unavailable')
      ? paused : care?.category ?? 'normal';
    const careLabel = resume ? 'resume' : category !== 'normal' ? category : undefined;
    const studentMessage = await appendMessage({
      context, conversationId, actor: context.role === 'student' ? 'student' : 'teacher',
      content: body.content, channel: body.channel, channelMessageId: body.channelMessageId,
      careLabel,
    });
    if (careLabel) {
      if (category !== 'normal' && category !== 'unavailable') {
        const repeatHostility = previousMessages.some(row => row.actor === 'student' && careTag(row) === 'hostility');
        if (category !== 'hostility' || repeatHostility) {
          const escalationId = await raiseEscalation({
            tenantId: context.tenantId, studentId: conversation.student_id,
            classroomId: await classroomOfStudent(context.tenantId, conversation.student_id).catch(() => null),
            kind: category === 'hostility' ? 'safety' : 'distress', priority: carePriority(category),
            title: CARE_TITLES[category],
            payload: { category, conversationId, messageId: studentMessage.id,
              excerpt: studentMessage.content_redacted.slice(0, 240),
              reasons: [care?.reason ?? '相談の途中のため、学習を休止しています。'], source: care?.source ?? 'rule' },
            dedupeHours: 6,
          });
          if (!escalationId) console.error('[student-care] 要フォローを記録できませんでした');
        }
        await recordGuardEvent({
          tenantId: context.tenantId, studentId: conversation.student_id, conversationId,
          source: care?.source === 'model' ? 'app_classifier' : 'app_rule', category,
          rule: category === 'hostility' ? 'conversation_boundary' : 'wellbeing_support',
          matchedExcerpt: studentMessage.content_redacted.slice(0, 240),
        });
      }
      const message = resume
        ? 'わかりました。無理のない範囲で、元のお題について説明してみてください。つらくなったら、いつでも休んで大丈夫です。'
        : careReply(category, Boolean(paused), body.content);
      await appendMessage({ context, conversationId, actor: 'agent', content: message, channel: body.channel, careLabel });
      const payload = { message, traceId, runId: care?.runId, conversationCompleted: false };
      return body.stream ? eventStream(payload) : json(payload);
    }
    if (conversation.purpose === 'tutorial') {
      const finishRequested = body.content === TUTORIAL_STOP_MESSAGE;
      let message = TUTORIAL_FINISH;
      let conversationCompleted = finishRequested;
      let runId: string | undefined;
      if (!finishRequested) {
        const [history, audience] = await Promise.all([listMessages(context, conversationId), studentTutorialAudience(context.tenantId, conversation.student_id)]);
        const learningHistory = history.filter(isLearningMessage);
        const studentTurn = Math.max(1, learningHistory.filter(item => item.actor === 'student').length);
        const result = await tutorialAgent.run({ context: buildConversationContext('', learningHistory, 5000), audience, studentTurn }, {
          traceId, tenantId: context.tenantId, studentId: conversation.student_id,
          conversationId, userId: context.userId, modelClass: 'economy', routingReason: 'onboarding_tutorial',
        });
        const reply = composeTutorialReply(result.data, studentTurn, audience);
        conversationCompleted = reply.conversationCompleted;
        message = reply.message;
        runId = result.meta.runId;
      }
      await appendMessage({context,conversationId,actor:'agent',content:message,channel:body.channel});
      if(conversationCompleted) await completeConversation(context,conversationId);
      const payload = {message,traceId,runId,conversationCompleted};
      return body.stream ? eventStream(payload) : json(payload);
    }
    if (context.role === 'student' && body.assignmentId && body.questionId) {
      const answer = await recordConversationAnswer({
        context,
        conversationId,
        assignmentId: body.assignmentId,
        questionId: body.questionId,
        answer: studentMessage.content_redacted,
        telemetry: body.telemetry,
      });
      // AI判定は返信を待たせない。灰色のときだけLLMを呼ぶので、多くは即終わる。
      const assignmentId = body.assignmentId;
      after(() => recordAnswerIntegrity({
        tenantId: context.tenantId,
        traceId,
        answerId: answer.id,
        studentId: context.userId,
        assignmentId,
        text: studentMessage.content_redacted,
        signals: {
          elapsedSec: body.telemetry?.elapsedSec ?? null,
          typingMs: body.telemetry?.typingMs ?? null,
          keystrokes: body.telemetry?.keystrokes ?? null,
          pasteCount: body.telemetry?.pasteCount ?? null,
          voiceChunks: body.telemetry?.voiceChunks ?? null,
          voiceHesitation: body.telemetry?.voiceHesitation ?? null,
        },
      }));
    }

    const fullMessages = (await listMessages(context, conversationId, 0)).filter(isLearningMessage);
    const studentTurn = fullMessages.filter((item) => item.actor === 'student').length;
    const atMaxTurns = studentTurn >= MAX_EXPLANATION_TURNS;
    const requiredFocus = focusForTurn(studentTurn);
    const decision = routeConversation({ message: body.content, state: conversation.state, channel: body.channel });
    let message: string = conversation.concept_id ? '' : fastPathMessage(decision.intent) ?? '';
    let runId: string | undefined;
    let conversationCompleted = atMaxTurns;
    if (!message && !atMaxTurns) {
      const question = conversation.concept_id ? await adminDb().from('questions').select('difficulty,body').eq('tenant_id', context.tenantId).eq('concept_id', conversation.concept_id).order('created_at', { ascending: false }).limit(1).maybeSingle() : null;
      if (question?.error) throw new Error(question.error.message);
      const difficulty = question?.data?.difficulty ?? 2;
      const result = await learningSupportAgent.run({
        studentMessage: body.content,
        context: `お題: ${question?.data?.body ?? ''}\n${
          // 音声は書き言葉にならない。言い回しの粗さを理由に減点させない。
          body.spoken ? '※この発言は音声入力です。話し言葉であることや聞き取りの揺れを理由に減点しないでください。\n' : ''
        }${buildConversationContext(conversation.summary, fullMessages, 8000)}`,
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
        modelClass: classForDifficulty(difficulty),
        routingReason: `question_difficulty_${difficulty}`,
      });
      message = result.data.message;
      runId = result.meta.runId;
      // AIは説明に応じて問いを選べる。短い初回発言だけで理解済みとはしない。
      conversationCompleted = conversationCompleted || (result.data.shouldFinish && studentTurn >= 2);
      if (conversationCompleted) message = '教えてくれてありがとう！自分の言葉で伝えようと頑張ったね。これで対話はおしまいだよ。';
      if (!conversationCompleted && (
        hasRepeatedQuestion(message, fullMessages)
        || !/[?？]/u.test(message)
      )) {
        message = fallbackQuestion(requiredFocus === 'finish' ? 'summary' : requiredFocus);
      }
    }
    if (atMaxTurns) {
      message = '最後まで教えてくれてありがとう！自分の言葉で伝えようと頑張ったね。これで対話はおしまいだよ。';
    }
    await appendMessage({ context, conversationId, actor: 'agent', content: message, channel: body.channel });
    if (conversationCompleted) await completeConversation(context, conversationId);
    maybeQueueConversationSummary({ tenantId: context.tenantId, conversationId, messageCount: conversation.message_count + 2, traceId });
    const payload = { message, traceId, runId, decision, conversationCompleted };
    return body.stream ? eventStream(payload) : json(payload);
  } catch (error) {
    // 危険な入力を遮断したときは、遮断して終わりにせず先生へ上げる。
    // 生徒が困っている合図かもしれず、放置してよい種類の失敗ではない。
    // モデル呼び出しの中で遮断されたぶんは call.ts が記録済み。
    // ここで拾うのは、呼び出し前の preCheck で止めた入力。
    if (error instanceof SafetyBlocked) {
      const context = await requireAuth().catch(() => null);
      if (context) {
        const { tenantId, role, userId } = context;
        after(() => reportSafetyBlock({
          error,
          tenantId,
          studentId: role === 'student' ? userId : null,
          escalate: role === 'student',
        }));
      }
    }
    return routeError(error);
  }
}
