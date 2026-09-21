'use client';

import { ConversationFeedback } from './feedback-card';
import { useEffect, useRef, useState } from 'react';
import { useWorkTelemetry } from './use-work-telemetry';

export interface ChatMessage {
  id: string;
  actor: string;
  content_redacted: string;
  seq: number;
}

interface ChatClientProps {
  conversationId: string;
  initialMessages: ChatMessage[];
  initialCompleted?: boolean;
  assignmentId?: string;
  questionId?: string;
}

export function ChatClient({ conversationId, initialMessages, initialCompleted = false, assignmentId, questionId }: ChatClientProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(initialCompleted);
  const [error, setError] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  // 直前の1往復だけ取り消せる。取り消した直後は、さらに前へは戻せない。
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const sequence = useRef(Math.max(0, ...initialMessages.map((message) => message.seq)));
  // 取り組みの様子を裏で記録する（生徒には見せない）
  const telemetry = useWorkTelemetry(assignmentId);
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send(event: { preventDefault: () => void }) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || completed) return;
    const measured = telemetry.consume();
    setInput('');
    setBusy(true);
    setError('');
    sequence.current += 1;
    setMessages((current) => [...current, {
      id: 'local-' + sequence.current,
      actor: 'student',
      content_redacted: content,
      seq: sequence.current,
    }]);

    try {
      const response = await fetch('/api/conversations/' + conversationId + '/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content,
          channel: 'web',
          stream: true,
          ...(assignmentId ? { assignmentId } : {}),
          ...(questionId ? { questionId } : {}),
          telemetry: measured,
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? '応答を受け取れませんでした。');
        setBusy(false);
        return;
      }

      sequence.current += 1;
      const agentId = 'agent-' + sequence.current;
      setStreamingId(agentId);
      setMessages((current) => [...current, { id: agentId, actor: 'agent', content_redacted: '', seq: sequence.current }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const consume = (block: string) => {
        if (block.startsWith('event: done')) {
          const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) return;
          const payload = JSON.parse(dataLine.slice(6)) as { conversationCompleted?: boolean };
          if (payload.conversationCompleted) setCompleted(true);
          return;
        }
        if (!block.startsWith('event: delta')) return;
        const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
        if (!dataLine) return;
        const delta = JSON.parse(dataLine.slice(6)) as { text?: string };
        if (delta.text) {
          setMessages((current) => current.map((item) => item.id === agentId
            ? { ...item, content_redacted: item.content_redacted + delta.text }
            : item));
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const block of events) consume(block);
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      setStreamingId(null);
      setBusy(false);
      setCanUndo(true);
    } catch {
      setError('通信に失敗しました。もう一度送信してください。');
      setStreamingId(null);
      setBusy(false);
    }
  }

  async function undo() {
    if (!canUndo || undoing || busy || completed) return;
    setUndoing(true);
    setError('');
    try {
      const response = await fetch('/api/conversations/' + conversationId + '/undo', { method: 'POST' });
      const result = await response.json() as { restoredText?: string; message?: string };
      if (!response.ok) { setError(result.message ?? '取り消せませんでした。'); return; }
      // 画面からも最後の「生徒→AI」を外し、書いた文章を入力欄に戻す
      setMessages((current) => {
        const lastStudent = [...current].reverse().find((message) => message.actor === 'student');
        return lastStudent ? current.filter((message) => message.seq < lastStudent.seq) : current;
      });
      setInput(result.restoredText ?? '');
      setCanUndo(false);
    } catch {
      setError('通信に失敗しました。');
    } finally {
      setUndoing(false);
    }
  }

  return <div className="grid gap-4">
    <div role="log" aria-live="polite" className="h-[min(58vh,560px)] space-y-5 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      {messages.length === 0 ? <div className="mx-auto max-w-md py-20 text-center"><p className="text-lg font-bold">AIへの説明を始めましょう</p><p className="mt-2 text-sm leading-6 text-slate-500">授業で学んだ概念を、何も知らないAIに教えてください。</p></div> : null}
      {messages.map((message) => {
        const isStudent = message.actor === 'student';
        return <div key={message.id} className={isStudent ? 'flex justify-end' : 'flex justify-start'}>
          <div className="max-w-[88%]">
            <p className={isStudent ? 'mb-1 text-right text-xs font-bold text-emerald-700' : 'mb-1 text-xs font-bold text-slate-500'}>{isStudent ? 'あなた' : 'AI'}</p>
            <div className={isStudent ? 'rounded-2xl rounded-tr-md bg-emerald-700 px-4 py-3 text-sm leading-7 text-white' : 'rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-800'}>{message.id === streamingId && !message.content_redacted ? <ThinkingIndicator /> : message.content_redacted}</div>
          </div>
        </div>;
      })}
      {busy && !streamingId ? <div role="status" aria-live="polite" className="flex justify-start"><div className="max-w-[88%]"><p className="mb-1 text-xs font-bold text-slate-500">AI</p><div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm text-slate-600"><Spinner />考えています…</div></div></div> : null}
      <div ref={endOfMessages} aria-hidden="true" />
    </div>
    {completed ? <ConversationFeedback conversationId={conversationId} /> : <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setInput('この概念は何を表すのかを説明します')} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs">意味を説明する</button>
        <button type="button" onClick={() => setInput('理由や他の概念とのつながりを説明します')} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs">つながりを説明する</button>
        <button type="button" onClick={() => setInput('具体例やたとえを追加します')} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs">具体例を出す</button>
        {canUndo ? <button
          type="button"
          onClick={undo}
          disabled={undoing || busy}
          className="ml-auto rounded-full border border-slate-400 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
        >
          {undoing ? '取り消しています…' : '↩ 直前の送信を取り消す'}
        </button> : null}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <label className="sr-only" htmlFor="chat-input">AIへの説明</label>
        <textarea id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
          telemetry.onKeyDown();
          // 日本語入力の変換確定でEnterが来るので、変換中は送信しない
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send(event);
          }
        }} onPaste={telemetry.onPaste} rows={3} maxLength={8000} placeholder="AIに教える内容を、自分の言葉で書いてください（Enterで送信／Shift+Enterで改行）" className="min-h-16 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none focus:border-emerald-600" />
        <button disabled={busy || !input.trim()} className="self-end rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? <span className="inline-flex items-center gap-2"><Spinner light />考え中…</span> : '送信'}</button>
      </form>
    </>}
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
  </div>;
}

function Spinner({ light = false }: { light?: boolean }) {
  return <span aria-hidden="true" className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${light ? 'border-white/40 border-t-white' : 'border-slate-300 border-t-emerald-700'}`} />;
}

function ThinkingIndicator() {
  return <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-slate-600"><Spinner />考えています…</span>;
}
