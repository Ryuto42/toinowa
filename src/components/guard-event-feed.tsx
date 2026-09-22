import { StatusPill } from '@/components/dashboard';
import { Icon } from '@/components/icon';
import { guardEventAction } from '@/lib/security/guard-event-label';
import { formatDateTime } from '@/lib/shared/format';

export interface GuardEventRow {
  id: number;
  source: string;
  category: string;
  rule: string;
  matched_excerpt: string | null;
  blocked_tools: string[];
  created_at: string;
  student_name?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  instruction_override: '指示の上書き',
  role_injection: '役割のなりすまし',
  secret_extraction: '内部情報の聞き出し',
  grading_override: '採点の書き換え',
  tool_abuse: 'ツールの悪用',
  encoded_payload: '難読化された入力',
  external_url: '外部リンク',
  jailbreak: '制限の解除要求',
  distress: 'つらさ・助けの相談',
  danger: '差し迫った危険',
  hostility: '言葉遣いへの注意',
  self_harm: '自傷のおそれ',
  child_safety: '子どもの安全',
};

const SOURCE_LABELS: Record<string, string> = {
  orca_guardrail: 'ゲートウェイ',
  orca_firewall: 'ファイアウォール',
  app_rule: 'アプリ',
  app_classifier: 'アプリ判定',
};

/** 相談・言葉遣いへの対応と、実際の遮断を区別する。 */
export function GuardEventFeed({ rows }: { rows: GuardEventRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[#8a9ab2]">安全性・相談の記録はありません。</p>;
  }
  return <ul className="divide-y divide-[#eef2f3]">
    {rows.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <Icon name="shield" className="text-[#b34e5b]" />
      <StatusPill tone="rose">{CATEGORY_LABELS[row.category] ?? row.category}</StatusPill>
      <span className="min-w-0 flex-1 truncate text-sm text-[#3d4d68]">
        {row.student_name ?? '対象不明'}
        {row.matched_excerpt ? <span className="text-[#8a9ab2]">・{row.matched_excerpt}</span> : null}
      </span>
      <span className="text-xs text-[#8a9ab2]">{SOURCE_LABELS[row.source] ?? row.source} · {guardEventAction(row.rule)} · {formatDateTime(row.created_at)}</span>
    </li>)}
  </ul>;
}
