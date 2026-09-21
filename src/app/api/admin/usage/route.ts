import { serverEnv } from '@/lib/shared/env.server';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, routeError, ApiInputError } from '@/lib/api/http';
import { summarizeUsage, type UsageRun } from '@/lib/admin/usage-summary';
export async function GET(request: Request) {
  try {
    const context = await requireRole('admin');
    const days = Number(new URL(request.url).searchParams.get('days') ?? 1);
    if (![1, 7, 30].includes(days)) throw new ApiInputError('期間が不正です');
    const db = adminDb();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const until = new Date().toISOString();
    const rows: UsageRun[] = [];
    let truncated = false;
    for (let offset = 0; offset < 10000; offset += 1000) {
      const result = await db.from('agent_runs').select('id,request_type,actor_id,student_id,status,resolved_model,input_tokens,output_tokens,cached_input_tokens,estimated_cost_usd,fallback_count,created_at,safety_result')
        .eq('tenant_id', context.tenantId).gte('created_at', since).lte('created_at', until).order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
      if (result.error) throw new Error(result.error.message);
      rows.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 1000) break;
      if (offset === 9000) truncated = true;
    }
    const ids = [...new Set(rows.flatMap(row => [row.actor_id ?? row.student_id].filter((id): id is string => Boolean(id))))];
    const names: Record<string, string> = {};
    for (let offset = 0; offset < ids.length; offset += 100) {
      const users = await db.from('users').select('id,display_name').eq('tenant_id', context.tenantId).in('id', ids.slice(offset, offset + 100));
      if (users.error) throw new Error(users.error.message);
      for (const user of users.data ?? []) names[user.id] = user.display_name;
    }
    const grouped = summarizeUsage(rows, names);
    const [tenant, today] = await Promise.all([
      db.from('tenants').select('ai_budget_limit_usd').eq('id', context.tenantId).single(),
      db.rpc('today_ai_spend', { p_tenant: context.tenantId }),
    ]);
    if (tenant.error || today.error) throw new Error('予算を取得できませんでした');
    const budget = { limitUsd: Math.min(Number(tenant.data.ai_budget_limit_usd), serverEnv.AI_DAILY_BUDGET_USD), spentUsd: Number(today.data) };
    const unpricedRuns = rows.filter(row => {
      const observation = row.safety_result as { unpricedAttempts?: number } | null;
      return (observation?.unpricedAttempts ?? 0) > 0 || ((row.input_tokens ?? 0) + (row.output_tokens ?? 0) > 0 && observation?.unpricedAttempts === undefined && !Number(row.estimated_cost_usd));
    }).length;
    // ゲートウェイが費用を返さず、カタログの単価から見積もった実行。
    // 「まったく分からない」とは別物なので、混ぜて出さない。
    const estimatedRuns = rows.filter(row => {
      const observation = row.safety_result as { estimatedAttempts?: number } | null;
      return (observation?.estimatedAttempts ?? 0) > 0;
    }).length;
    return json({ recent: rows.slice(0, 30).map(row => ({ id: row.id, requestType: row.request_type, userName: names[row.actor_id ?? row.student_id ?? ''] ?? 'システム処理', model: row.resolved_model, costUsd: row.estimated_cost_usd, createdAt: row.created_at, status: row.status })), budget, unpricedRuns, estimatedRuns, grouped, summary: { requests: rows.length, costUsd: grouped.reduce((n,r) => n+r.costUsd,0), tokens: grouped.reduce((n,r) => n+r.tokens,0), inputTokens: rows.reduce((n,r) => n+(r.input_tokens ?? 0),0), cachedTokens: rows.reduce((n,r) => n+((r as { cached_input_tokens?: number }).cached_input_tokens ?? 0),0) }, truncated, updatedAt: until });
  } catch (error) { return routeError(error); }
}
