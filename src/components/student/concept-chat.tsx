'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatClient, ChatMessage } from './chat-client';

interface ConversationResponse {
  conversation?: { id: string; state?: string };
  message?: string;
}

interface ConversationLoadResult {
  conversationId: string;
  messages: ChatMessage[];
  completed: boolean;
}

export function ConceptChatLauncher({
  assignmentId,
  lessonId,
  conceptId,
  questionId,
}: {
  assignmentId: string;
  lessonId: string;
  conceptId: string;
  questionId: string;
}) {
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const requestRef = useRef<{ key: string; promise: Promise<ConversationLoadResult> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = [assignmentId, lessonId, conceptId].join(':');
    if (!requestRef.current || requestRef.current.key !== key) {
      requestRef.current = {
        key,
        promise: (async () => {
          const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ channel: 'web', lessonId, conceptId, assignmentId }),
          });
          const result = await response.json().catch(() => ({})) as ConversationResponse;
          if (!response.ok || !result.conversation?.id) {
            throw new Error(result.message ?? '課題を開始できませんでした。');
          }
          const messageResponse = await fetch('/api/conversations/' + result.conversation.id + '/messages');
          const messageResult = await messageResponse.json().catch(() => ({})) as { messages?: ChatMessage[]; message?: string };
          if (!messageResponse.ok) {
            throw new Error(messageResult.message ?? '課題の問いを読み込めませんでした。');
          }
          return {
            conversationId: result.conversation.id,
            messages: messageResult.messages ?? [],
            completed: result.conversation.state === 'completed',
          };
        })(),
      };
    }
    void requestRef.current.promise
      .then((result) => {
        if (cancelled) return;
        setConversationId(result.conversationId);
        setMessages(result.messages);
        setCompleted(result.completed);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '課題を読み込めませんでした。');
      });
    return () => { cancelled = true; };
  }, [assignmentId, conceptId, lessonId, retryCount]);

  if (error) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-800"><p>{error}</p><button type="button" onClick={() => { requestRef.current = null; setError(''); setConversationId(''); setMessages([]); setCompleted(false); setRetryCount((count) => count + 1); }} className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 font-bold text-rose-800">もう一度読み込む</button></div>;
  if (!conversationId) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">AIがワークを準備しています…</div>;
  return <ChatClient key={conversationId} conversationId={conversationId} initialMessages={messages} initialCompleted={completed} assignmentId={assignmentId} questionId={questionId} />;
}
