'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';

export interface Escalation {
  id: string;
  title: string;
  kind: string;
  priority: string;
  status: string;
  created_at: string;
  student_id?: string | null;
  payload?: unknown;
  users?: { display_name?: string } | null;
}

const KIND_LABELS: Record<string, string> = {
  ai_suspected: '生成AIの疑い',
  repeated_failure: '同じつまずきの繰り返し',
  stalled: '学習停滞・未着手',
  safety: '安全上の懸念',
  low_confidence: '分析の確信度が低い',
  budget: 'AI利用上限',
  distress: '生徒の様子',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '緊急', high: '高', medium: '中', low: '低',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function InterventionList({ initial, studentBase = '/teacher/students' }: { initial: Escalation[]; studentBase?: string }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function close(id: string, verdict?: 'not_ai' | 'confirmed_ai') {
    const note = verdict === 'not_ai' ? '先生が確認し、生成AIではないと判断しました。'
      : verdict === 'confirmed_ai' ? '先生が確認し、生成AIの利用があったと判断しました。'
      : '先生が確認しました。';
    setBusy(id); setError('');
    try {
      const response = await fetch(`/api/escalations/${id}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', note, ...(verdict ? { verdict } : {}) }),
      });
      if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
      else setError('保存できませんでした。時間をおいてもう一度お試しください。');
    } catch {
      setError('通信に失敗しました。');
    } finally {
      setBusy(null);
    }
  }

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  return <div>
    {error ? <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <DataTable
      rows={items}
      getKey={(item) => item.id}
      searchIn={(item) => `${item.title} ${item.users?.display_name ?? ''} ${KIND_LABELS[item.kind] ?? item.kind}`}
      searchPlaceholder="内容・生徒名で検索"
      empty="いま要フォローの生徒はいません"
      initialSort={{ key: 'priority' }}
      filters={[
        { key: 'kind', label: '種類', options: [...new Set(items.map((item) => item.kind))].map((kind) => ({ value: kind, label: KIND_LABELS[kind] ?? kind })), match: (item, value) => item.kind === value },
        { key: 'priority', label: '優先度', options: Object.keys(PRIORITY_ORDER).map((value) => ({ value, label: PRIORITY_LABELS[value] ?? value })), match: (item, value) => item.priority === value },
      ]}
      columns={[
        { key: 'priority', label: '優先度', sortBy: (item) => PRIORITY_ORDER[item.priority] ?? 9, render: () => null },
        { key: 'created', label: '検知した日時', sortBy: (item) => item.created_at, render: () => null },
        { key: 'student', label: '生徒名', sortBy: (item) => item.users?.display_name ?? null, render: () => null },
      ]}
      renderCard={(item) => {
    const payload = asRecord(item.payload);
    const reasons = asStrings(payload.reasons);
    const humanSignals = asStrings(payload.humanSignals);
    const occurrences = Number(payload.occurrences ?? 1);
    const likelihood = typeof payload.likelihood === 'number' ? payload.likelihood : null;
    const excerpt = typeof payload.excerpt === 'string' ? payload.excerpt : '';
    const suspectedAi = item.kind === 'ai_suspected';

    return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              item.priority === 'urgent' ? 'bg-rose-100 text-rose-700'
                : item.priority === 'high' ? 'bg-orange-100 text-orange-700'
                : 'bg-amber-50 text-amber-800'}`}>
              {PRIORITY_LABELS[item.priority] ?? item.priority}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {KIND_LABELS[item.kind] ?? item.kind}
            </span>
            {occurrences > 1
              ? <span className="text-xs text-slate-500">{occurrences}回検知</span>
              : null}
            {likelihood !== null
              ? <span className="text-xs text-slate-500">目安 {Math.round(likelihood * 100)}%</span>
              : null}
          </div>
          <p className="mt-2 font-bold">{item.title}</p>
          <p className="mt-1 text-sm text-slate-500">
            {item.student_id
              ? <Link href={`${studentBase}/${item.student_id}`} className="font-semibold text-[#237d75] underline">
                  {item.users?.display_name ?? '対象生徒'}の学習記録を見る
                </Link>
              : (item.users?.display_name ?? '対象生徒')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {suspectedAi ? <>
            <button
              type="button"
              disabled={busy === item.id}
              onClick={() => close(item.id, 'not_ai')}
              className="rounded-lg border border-emerald-600 px-3 py-2 text-sm font-bold text-emerald-700 disabled:opacity-50"
            >
              問題なし
            </button>
            <button
              type="button"
              disabled={busy === item.id}
              onClick={() => close(item.id, 'confirmed_ai')}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              AI利用と判断
            </button>
          </> : <button
            type="button"
            disabled={busy === item.id}
            onClick={() => close(item.id)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            確認しました
          </button>}
        </div>
      </div>

      {reasons.length || humanSignals.length || excerpt ? <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#237d75]">根拠を見る</summary>
        <div className="mt-3 space-y-3 text-sm">
          {reasons.length ? <div>
            <p className="font-bold text-slate-700">そう判断した理由</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">
              {reasons.map((reason, index) => <li key={index}>{reason}</li>)}
            </ul>
          </div> : null}
          {/* 反証を必ず並べて出す。片側だけ見せると誤検知に気づけない。 */}
          {humanSignals.length ? <div>
            <p className="font-bold text-slate-700">本人が書いたと思われる点</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">
              {humanSignals.map((signal, index) => <li key={index}>{signal}</li>)}
            </ul>
          </div> : null}
          {excerpt ? <div>
            <p className="font-bold text-slate-700">提出された説明の冒頭</p>
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 leading-6 text-slate-600">{excerpt}</p>
          </div> : null}
          <p className="text-xs text-slate-500">
            自動判定は手がかりであって証拠ではありません。最終的な判断は先生が行ってください。
          </p>
        </div>
      </details> : null}
    </article>;
  }}
    />
  </div>;
}
