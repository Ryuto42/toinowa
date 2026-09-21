'use client';

import Link from 'next/link';
import { TUTORIAL_STOP_MESSAGE } from '@/lib/tutorial/content';
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
  tutorial?: boolean;
  assignmentId?: string;
  questionId?: string;
}

export function ChatClient({ conversationId, initialMessages, initialCompleted = false, assignmentId, questionId, tutorial = false }: ChatClientProps) {
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
  const messageLog = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const log = messageLog.current;
    if (log && followLatest.current) log.scrollTop = log.scrollHeight;
  }, [messages, busy, completed]);

  async function send(event: { preventDefault: () => void }, preset?: string) {
    event.preventDefault();
    const content = (preset ?? input).trim();
    if (!content || busy || undoing || completed) return;
    followLatest.current = true;
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

  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div ref={messageLog} role="log" aria-label="対話の履歴" aria-live="polite" onScroll={event => { const log = event.currentTarget; followLatest.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80; }} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      {messages.length === 0 ? <div className="mx-auto max-w-md py-20 text-center"><p className="text-lg font-bold">AIへの説明を始めましょう</p><p className="mt-2 text-sm leading-6 text-slate-500">授業で学んだ概念を、何も知らないAIに教えてください。</p></div> : null}
      {messages.map((message) => {
        const isStudent = message.actor === 'student';
        return <div key={message.id} className={isStudent ? 'flex justify-end' : 'flex justify-start'}>
          <div className="min-w-0 max-w-[88%] break-words">
            <p className={isStudent ? 'mb-1 text-right text-xs font-bold text-emerald-700' : 'mb-1 text-xs font-bold text-slate-500'}>{isStudent ? 'あなた' : 'AI'}</p>
            <div className={isStudent ? 'whitespace-pre-wrap rounded-2xl rounded-tr-md bg-emerald-700 px-4 py-3 text-sm leading-7 text-white' : 'whitespace-pre-wrap rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-800'}>{message.id === streamingId && !message.content_redacted ? <ThinkingIndicator /> : message.content_redacted}</div>
          </div>
        </div>;
      })}
      {busy && !streamingId ? <div role="status" aria-live="polite" className="flex justify-start"><div className="min-w-0 max-w-[88%] break-words"><p className="mb-1 text-xs font-bold text-slate-500">AI</p><div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm text-slate-600"><Spinner />考えています…</div></div></div> : null}
      {completed ? tutorial ? <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-bold">はじめての練習、できました！</p><p className="mt-2 leading-7">自分の言葉で伝えて、AIの質問に答える。宿題でも同じようにやり取りしてみよう。先生から届いたお題は「AIワーク」で確認できます。</p></div> : <ConversationFeedback conversationId={conversationId} /> : null}
    </div>
    {completed ? <Link href="/student/study" className="shrink-0 rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white">AIワークへ戻る</Link> : <div className="chat-composer shrink-0 space-y-2">
      {canUndo ? <div className="flex justify-end"><button type="button" onClick={undo} disabled={undoing || busy} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 underline disabled:opacity-50">{undoing ? '取り消しています…' : '↩ 直前の送信を取り消す'}</button></div> : null}
      <form onSubmit={event => void send(event)} className="flex items-end gap-2">
        <label className="sr-only" htmlFor="chat-input">メッセージ入力</label>
        <textarea id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
          telemetry.onKeyDown();
          // 日本語入力の変換確定でEnterが来るので、変換中は送信しない
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send(event);
          }
        }} onPaste={telemetry.onPaste} rows={2} maxLength={8000} placeholder={tutorial ? "好きなことなど、気軽に書いてみよう" : "自分の言葉で教えてみよう"} className="h-20 min-h-16 min-w-0 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-base leading-7 outline-none focus:border-emerald-600 sm:text-sm" />
        <button disabled={busy || undoing || !input.trim()} className="shrink-0 self-end rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? <span className="inline-flex items-center gap-2"><Spinner light />考え中…</span> : '送信'}</button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-1"><p className="text-[11px] leading-4 text-slate-500">送信ボタン・Enterで送信 ／ Shift+Enterで改行</p>{tutorial ? <button type="button" disabled={busy || undoing} onClick={event => void send(event, TUTORIAL_STOP_MESSAGE)} className="shrink-0 text-xs text-slate-600 underline disabled:opacity-50">{TUTORIAL_STOP_MESSAGE}</button> : null}</div>
    </div>}
    {error ? <p role="alert" className="max-h-16 shrink-0 overflow-y-auto text-sm text-rose-700">{error}</p> : null}
  </div>;
}

function Spinner({ light = false }: { light?: boolean }) {
  return <span aria-hidden="true" className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${light ? 'border-white/40 border-t-white' : 'border-slate-300 border-t-emerald-700'}`} />;
}

function ThinkingIndicator() {
  return <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-slate-600"><Spinner />考えています…</span>;
}
