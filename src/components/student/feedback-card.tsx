'use client';
import { useEffect, useState } from 'react';
import type { SimpleFeedback } from '@/lib/mastery/feedback';
export function FeedbackCard({ feedback }: { feedback: SimpleFeedback }) {
  return <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-bold text-emerald-950">{feedback.encouragement}</h2><p className="mt-3 text-sm leading-7 text-slate-700">{feedback.goodPoint}</p><p className="mt-3 rounded-xl bg-white p-3 text-sm leading-7 text-emerald-900">{feedback.nextStep}</p></article>;
}
export function ConversationFeedback({ conversationId }: { conversationId: string }) {
  const [feedback, setFeedback] = useState<SimpleFeedback | null>(null);
  const [status, setStatus] = useState('振り返りを準備しています…');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    async function poll() {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/feedback`);
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (stopped) return;
        if (result.feedback) { setFeedback(result.feedback); return; }
        if (result.status === 'in_progress') { setStatus('振り返りは対話が終わると表示されます。'); return; }
        setStatus('お疲れさま！振り返りを準備しています。少し待ってね。');
      } catch { if (!stopped) setStatus('まだ読み込めませんでした。学習記録からも後で確認できます。'); }
      if (!stopped && ++count < 24) timer = setTimeout(poll, 5000);
      else if (!stopped) setStatus('分析を続けています。後で学習記録を確認してね。');
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [conversationId, attempt]);
  if (feedback) return <FeedbackCard feedback={feedback} />;
  return <div role="status" className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900"><p>{status}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 underline">もう一度確認</button></div>;
}
