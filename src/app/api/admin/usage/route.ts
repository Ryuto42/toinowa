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
      const result = await db.from('agent_runs').select('actor_id,student_id,status,resolved_model,input_tokens,output_tokens,estimated_cost_usd,fallback_count,created_at')
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
    return json({ grouped, summary: { requests: rows.length, costUsd: grouped.reduce((n,r) => n+r.costUsd,0), tokens: grouped.reduce((n,r) => n+r.tokens,0) }, truncated, updatedAt: until });
  } catch (error) { return routeError(error); }
}
