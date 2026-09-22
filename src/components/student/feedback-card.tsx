'use client';
import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/dashboard';
import { formatDate } from '@/lib/shared/format';
import type { SimpleFeedback } from '@/lib/mastery/feedback';

// 点数は出さず、今回の手応えだけを一言で伝える。
const LEVELS = {
  strong: { label: 'よく説明できた', note: '自分の言葉で最後まで筋道を立てて説明できました。', tone: 'emerald' as const },
  steady: { label: 'だいたい説明できた', note: '大事なところは説明できました。あと少し足すともっと伝わります。', tone: 'emerald' as const },
  retry: { label: 'もう一度やってみよう', note: 'うまく言葉にできないところがありました。次にもう一度説明してみよう。', tone: 'amber' as const },
};

export function FeedbackCard({ feedback }: { feedback: SimpleFeedback }) {
  // 一覧では同じ形のカードが並ぶので、どの課題の評価かを見出しと日付で区別できるようにする。
  const level = feedback.level ? LEVELS[feedback.level] : null;
  return <article className="rounded-[22px] border border-[#e3eaee] bg-white p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-bold text-[#17233d]">{feedback.concept}</h2>
        <p className="mt-1 text-xs text-[#8a9ab2]">
          {feedback.lesson ? `${feedback.lesson} · ` : ''}{formatDate(feedback.completedAt ?? feedback.createdAt)}に説明
        </p>
      </div>
      {feedback.review === 'confirmed' ? <StatusPill tone="emerald">確認ずみ</StatusPill>
        : feedback.review === 'revised' ? <StatusPill tone="blue">先生が見直しました</StatusPill>
          : <StatusPill tone="amber">先生が確認中</StatusPill>}
    </div>
    {level ? <div className="mt-4 flex flex-wrap items-center gap-2">
      <StatusPill tone={level.tone}>{level.label}</StatusPill>
      <span className="text-sm leading-7 text-[#60708d]">{level.note}</span>
    </div> : null}
    {feedback.goodPoint || feedback.nextStep
      ? <dl className="mt-4 space-y-3">
          {feedback.goodPoint ? <div className="rounded-xl bg-[#eff9f6] p-4">
            <dt className="text-xs font-semibold text-[#287f6e]">できていたこと</dt>
            <dd className="mt-1 text-sm leading-7 text-[#26354e]">{feedback.goodPoint}</dd>
          </div> : null}
          {feedback.nextStep ? <div className="rounded-xl border border-[#eef2f3] p-4">
            <dt className="text-xs font-semibold text-[#60708d]">次にやってみよう</dt>
            <dd className="mt-1 text-sm leading-7 text-[#26354e]">{feedback.nextStep}</dd>
          </div> : null}
        </dl>
      : feedback.review === 'revised'
        ? <p className="mt-4 rounded-xl bg-[#edf2ff] p-4 text-sm leading-7 text-[#5865ba]">
            この回は先生が内容を見直して、評価をつけ直しました。どこを直すとよいかは先生に聞いてみよう。
          </p>
        : <p className="mt-4 rounded-xl bg-[#fff5e7] p-4 text-sm leading-7 text-[#a36b22]">
            この説明は先生が確認しています。確認が終わると、できていたことと次の一歩がここに出ます。
          </p>}
  </article>;
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
  return <div role="status" className="rounded-[22px] border border-[#e3eaee] bg-white p-6 text-sm leading-7 text-[#26354e]">
    <p>{status}</p>
    <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-700">もう一度確認</button>
  </div>;
}
