'use client';

import { FormEvent, useRef, useState } from 'react';

interface Message { id: string; actor: string; content_redacted: string; seq: number }

export function ChatClient({ conversationId, initialMessages }: { conversationId: string; initialMessages: Message[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(initialMessages.length);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setInput(''); setBusy(true); setError('');
    sequence.current += 1;
    setMessages((current) => [...current, { id: `local-${sequence.current}`, actor: 'student', content_redacted: content, seq: sequence.current }]);
    const response = await fetch(`/api/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, channel: 'web', stream: true }) });
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? '応答を受け取れませんでした。'); setBusy(false); return;
    }
    sequence.current += 1;
    const agentId = `agent-${sequence.current}`;
    setMessages((current) => [...current, { id: agentId, actor: 'agent', content_redacted: '', seq: sequence.current }]);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const block of events) {
        if (!block.startsWith('event: delta')) continue;
        const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
        if (!dataLine) continue;
        const delta = JSON.parse(dataLine.slice(6)) as { text?: string };
        if (delta.text) setMessages((current) => current.map((item) => item.id === agentId ? { ...item, content_redacted: item.content_redacted + delta.text } : item));
      }
    }
    setBusy(false);
  }

  return <div className="grid gap-4">
    <div aria-live="polite" className="min-h-[420px] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      {messages.length === 0 ? <div className="mx-auto max-w-md py-20 text-center"><p className="text-lg font-bold">どこから一緒に考えますか？</p><p className="mt-2 text-sm text-slate-500">問題文や、分からなくなったところを送ってください。</p></div> : null}
      {messages.map((message) => <div key={message.id} className={`flex ${message.actor === 'student' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.actor === 'student' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-800'}`}>{message.content_redacted || '…'}</div></div>)}
    </div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setInput('ヒントを一つください')} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs">ヒント</button><button type="button" onClick={() => setInput('どこから考えればよいか分かりません')} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs">分からない</button><button type="button" onClick={() => setInput('先生に相談したいです')} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs">先生に聞く</button></div>
    <form onSubmit={send} className="flex gap-2"><label className="sr-only" htmlFor="chat-input">メッセージ</label><textarea id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} rows={2} maxLength={8000} placeholder="考えたことや質問を入力" className="min-h-14 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-600"/><button disabled={busy || !input.trim()} className="rounded-xl bg-emerald-700 px-5 font-bold text-white disabled:opacity-50">送信</button></form>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
  </div>;
}
