'use client';

import Link from 'next/link';
import { ConversationFeedback } from './feedback-card';
import { useEffect, useRef, useState } from 'react';
import { useWorkTelemetry } from './use-work-telemetry';
import { VoiceInput } from './voice-input';
import { canUndoSavedExchange } from '@/lib/conversation/undo';

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
  initialUndoBlockedMessageId?: string | null;
  tutorial?: boolean;
  assignmentId?: string;
  questionId?: string;
}

export function ChatClient({ conversationId, initialMessages, initialCompleted = false, initialUndoBlockedMessageId, assignmentId, questionId, tutorial = false }: ChatClientProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(initialCompleted);
  const [error, setError] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  // 話している最中の書き起こし。まだ送っていないので、見た目だけ吹き出しに出す。
  const [speaking, setSpeaking] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState('');
  // 送るときの本文は ref から読む。更新関数の中で送ると二重送信になりうる。
  const voiceDraftRef = useRef('');
  const spokenInputRef = useRef(false);
  // 直前の1往復だけ取り消せる。取り消した直後は、さらに前へは戻せない。
  const [canUndo, setCanUndo] = useState(() => canUndoSavedExchange(initialMessages, initialCompleted, initialUndoBlockedMessageId));
  const [undoing, setUndoing] = useState(false);
  const sequence = useRef(Math.max(0, ...initialMessages.map((message) => message.seq)));
  // 取り組みの様子を裏で記録する（生徒には見せない）
  const telemetry = useWorkTelemetry(assignmentId);
  const messageLog = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const log = messageLog.current;
    if (log && followLatest.current) log.scrollTop = log.scrollHeight;
  }, [messages, busy, completed, voiceDraft]);

  async function send(event: { preventDefault: () => void }) {
    event.preventDefault();
    const content = input.trim();
    if (!content || speaking || busy || undoing || completed) return;
    setInput('');
    const spoken = spokenInputRef.current;
    spokenInputRef.current = false;
    await sendText(content, spoken);
  }

  async function sendText(raw: string, spoken = false) {
    const content = raw.trim();
    if (!content || busy || undoing || completed) return;
    followLatest.current = true;
    const measured = telemetry.consume();
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
          ...(spoken ? { spoken: true } : {}),
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
    <div ref={messageLog} role="log" aria-label="対話の履歴" aria-live="polite" onScroll={event => { const log = event.currentTarget; followLatest.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80; }} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 pb-8 sm:p-6 sm:pb-8">
      {messages.length === 0 ? <div className="mx-auto max-w-md py-20 text-center"><p className="text-lg font-bold">AIへの説明を始めましょう</p><p className="mt-2 text-sm leading-6 text-slate-500">授業で学んだ概念を、何も知らないAIに教えてください。</p></div> : null}
      {messages.map((message) => {
        const isStudent = message.actor === 'student';
        return <div key={message.id} className={`chat-bubble-in ${isStudent ? 'flex justify-end' : 'flex justify-start'}`}>
          <div className="min-w-0 max-w-[88%] break-words">
            <p className={isStudent ? 'mb-1 text-right text-xs font-bold text-emerald-700' : 'mb-1 text-xs font-bold text-slate-500'}>{isStudent ? 'あなた' : 'AI'}</p>
            <div className={isStudent ? 'whitespace-pre-wrap rounded-2xl rounded-tr-md bg-emerald-700 px-4 py-3 text-sm leading-7 text-white' : 'space-y-2 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800'}>{message.id === streamingId && !message.content_redacted ? <ThinkingIndicator /> : isStudent ? message.content_redacted : message.content_redacted.split(/\r?\n(?:[ \t]*\r?\n)+/u).map((paragraph, index) => <p key={index} className="chat-line-in whitespace-pre-wrap">{paragraph}</p>)}</div>
          </div>
        </div>;
      })}
      {/* まだ送っていない、話している最中の吹き出し。
          送信済みと同じ見た目にすると取り違えるので、点線の枠で区別する。 */}
      {speaking ? <div className="chat-bubble-in flex justify-end">
        <div className="min-w-0 max-w-[88%] break-words">
          <p className="mb-1 flex items-center justify-end gap-1.5 text-right text-xs font-bold text-emerald-700">
            <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            あなた（話しています）
          </p>
          <div role="status" aria-live="polite" className="whitespace-pre-wrap rounded-2xl rounded-tr-md border-2 border-dashed border-emerald-400 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-950">
            {voiceDraft || <span className="text-emerald-700/70">聞いています…</span>}
          </div>
        </div>
      </div> : null}
      {busy && !streamingId ? <div role="status" aria-live="polite" className="flex justify-start"><div className="min-w-0 max-w-[88%] break-words"><p className="mb-1 text-xs font-bold text-slate-500">AI</p><div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm text-slate-600"><Spinner />考えています…</div></div></div> : null}
      {completed ? tutorial ? <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-bold">はじめての練習、できました！</p><p className="mt-2 leading-7">自分の言葉で伝えて、AIの質問に答える。宿題でも同じようにやり取りしてみよう。先生から届いたお題は「課題」で確認できます。</p></div> : <ConversationFeedback conversationId={conversationId} /> : null}
    </div>
    {completed ? <Link href="/student/study" className="shrink-0 rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white">課題へ戻る</Link> : <div className="chat-composer shrink-0 space-y-2">
      <div className="flex items-center gap-2">
      <form onSubmit={event => void send(event)} className="relative flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/15">
        {canUndo ? <button type="button" onClick={undo} disabled={undoing || busy || speaking} className="chat-undo-button absolute bottom-full right-3 z-10 min-h-6 rounded-t-md border border-b-0 border-slate-200 bg-white px-2 py-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:text-slate-400">{undoing ? '取り消しています…' : '↩ 直前の送信を取り消す'}</button> : null}
        <label className="sr-only" htmlFor="chat-input">メッセージ入力</label>
        <textarea id="chat-input" readOnly={speaking} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
          telemetry.onKeyDown();
          // 日本語入力の変換確定でEnterが来るので、変換中は送信しない
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send(event);
          }
        }} onPaste={telemetry.onPaste} rows={2} maxLength={8000} placeholder={tutorial ? "好きなことなど、気軽に書いてみよう" : "自分の言葉で教えてみよう"} aria-describedby="chat-input-help" className="h-14 min-h-12 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-1 text-base outline-none" />
        <button type="submit" disabled={busy || undoing || speaking || !input.trim()} aria-label={busy ? 'AIが返事を考えています' : '送信'} className="inline-flex min-h-12 w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-base font-bold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:bg-slate-200 disabled:text-slate-500">
          {busy ? <><Spinner /><span>考え中</span></> : <span className="inline-flex -translate-x-px items-center gap-1"><svg aria-hidden="true" viewBox="4 2 16 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-4 shrink-0"><path d="M12 19V5m-6 6 6-6 6 6" /></svg><span>送信</span></span>}
        </button>
      </form>
      {/* 話した端から対話の中に出していく。
          認識が終わったら入力欄で確認し、手入力と同じ送信操作をする。 */}
      <VoiceInput
        conversationId={conversationId}
        disabled={busy || undoing}
        // 質問全文は渡さない。無音をその文章で埋める誤認識を防ぐ。
        topic={initialMessages.find(item => item.actor === 'agent')?.content_redacted.match(/^「([^」]{1,100})」について/)?.[1]}
        previousText={() => voiceDraftRef.current}
        onStart={() => {
          followLatest.current = true;
          voiceDraftRef.current = '';
          setVoiceDraft('');
          setSpeaking(true);
        }}
        onText={(text) => {
          voiceDraftRef.current = (voiceDraftRef.current ? `${voiceDraftRef.current} ${text}` : text).slice(0, 8000);
          setVoiceDraft(voiceDraftRef.current);
        }}
        onHesitation={telemetry.onHesitation}
        onStop={() => {
          const spoken = voiceDraftRef.current;
          voiceDraftRef.current = '';
          setVoiceDraft('');
          setSpeaking(false);
          if (spoken) {
            setInput(current => (current ? `${current} ${spoken}` : spoken).slice(0, 8000));
            spokenInputRef.current = true;
          }
          document.getElementById('chat-input')?.focus();
        }}
      />
      </div>
      <p id="chat-input-help" className="px-1 text-xs leading-4 text-slate-500">書けたら「送信」を押してね。マイクを押すと声で入力できます。もう一度押して止めたら、文字を確認して送信してね。<span className="hidden sm:inline"> Enterでも送信 ／ Shift+Enterで改行</span></p>
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
