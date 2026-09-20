export interface UsageRun {
  actor_id?: string | null; student_id?: string | null; resolved_model: string | null;
  input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null;
  status: string; fallback_count: number; created_at: string;
}
export function summarizeUsage(rows: UsageRun[], names: Record<string, string>) {
  const grouped = new Map<string, { userId: string | null; userName: string; model: string; requests: number; tokens: number; costUsd: number; fallbacks: number; failures: number; lastUsed: string }>();
  for (const row of rows) {
    const userId = row.actor_id ?? row.student_id ?? null;
    const model = row.resolved_model ?? 'モデル未到達';
    const key = JSON.stringify([userId, model]);
    const item = grouped.get(key) ?? { userId, userName: userId ? names[userId] ?? '登録ユーザー' : 'システム処理', model, requests: 0, tokens: 0, costUsd: 0, fallbacks: 0, failures: 0, lastUsed: row.created_at };
    item.requests++;
    item.tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    item.costUsd += Number(row.estimated_cost_usd ?? 0);
    item.fallbacks += row.fallback_count;
    item.failures += ['error', 'blocked', 'degraded', 'rate_limited'].includes(row.status) ? 1 : 0;
    if (row.created_at > item.lastUsed) item.lastUsed = row.created_at;
    grouped.set(key, item);
  }
  return [...grouped.values()].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
}
