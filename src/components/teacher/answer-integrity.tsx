import { StatusPill } from '@/components/dashboard';
import { jsonRecord, stringItems } from './analysis';

const VERDICT: Record<string, { label: string; tone: 'emerald' | 'amber' | 'rose' }> = {
  low: { label: '本人の説明とみられます', tone: 'emerald' },
  medium: { label: '書き方を確認してください', tone: 'amber' },
  high: { label: '生成AIの可能性があります', tone: 'rose' },
};

const PACE: Record<string, string> = {
  expected: '所要時間は説明量に見合っています',
  too_fast: '説明量のわりに提出が早すぎます',
  too_slow: '提出までにかなり時間がかかっています',
};

/**
 * 回答1件の本人性の判定を先生に見せる。
 *
 * 疑いが高いときは要フォローへ上がるが、それ以外は記録されるだけで
 * 先生の目に触れない。判定の根拠は「疑う理由」と「本人らしい特徴」の
 * 両方を出し、先生が自分で判断できる形にする。
 */
export function AnswerIntegrity({ likelihood, signals }: { likelihood: number | null; signals: unknown }) {
  const data = jsonRecord(signals);
  const verdict = typeof data.verdict === 'string' ? data.verdict : null;
  if (!verdict) return null;

  const view = VERDICT[verdict] ?? VERDICT.medium;
  const reasons = stringItems(data.reasons);
  const humanSignals = stringItems(data.humanSignals);
  const pace = jsonRecord(data.pace);
  const paceNote = typeof pace.verdict === 'string' ? PACE[pace.verdict] : undefined;
  const percent = likelihood === null ? null : Math.round(likelihood * 100);

  return <details className="mt-2 border-t border-slate-100 pt-2">
    <summary className="flex cursor-pointer items-center gap-2 text-xs">
      <StatusPill tone={view.tone}>{view.label}</StatusPill>
      {percent === null ? null : <span className="tabular-nums text-slate-400">AI度 {percent}%</span>}
    </summary>
    <div className="mt-2 space-y-2 text-xs leading-6 text-slate-600">
      {humanSignals.length ? <div>
        <p className="font-bold text-[#1c6e60]">本人が説明したと考えられる点</p>
        <ul className="list-disc pl-4">{humanSignals.map((item) => <li key={item}>{item}</li>)}</ul>
      </div> : null}
      {reasons.length ? <div>
        <p className="font-bold text-[#8a5e12]">気になった点</p>
        <ul className="list-disc pl-4">{reasons.map((item) => <li key={item}>{item}</li>)}</ul>
      </div> : null}
      {paceNote ? <p className="text-slate-500">{paceNote}</p> : null}
      {data.judged === true ? <p className="text-slate-400">ヒューリスティックで判断が割れたため、AIにも判定させた結果です。</p> : null}
    </div>
  </details>;
}
