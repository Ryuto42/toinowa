import 'server-only';
import { after } from 'next/server';
import { adminDb } from '@/lib/database/admin';
import { serverEnv } from '@/lib/shared/env.server';
import type { EnqueueJobInput, JobRow } from './types';

/**
 * ジョブを冪等に投入する。同じkind/idempotencyKeyは一度だけ作られる。
 * RLSでjobsは利用者から非公開なので、ここはservice role専用の境界に置く。
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<JobRow | null> {
  const db = adminDb();
  const { data, error } = await db
    .from('jobs')
    .upsert(
      {
        tenant_id: input.tenantId,
        kind: input.kind,
        idempotency_key: input.idempotencyKey,
        payload: input.payload ?? {},
        priority: input.priority ?? 5,
        max_attempts: input.maxAttempts ?? 5,
        run_after: input.runAfter ?? new Date().toISOString(),
        trace_id: input.traceId,
      },
      { onConflict: 'kind,idempotency_key', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[jobs] enqueue failed:', error.message);
    return null;
  }
  if (data) return data;

  // ignoreDuplicatesは行を返さないため、既存ジョブを読む。
  const existing = await db
    .from('jobs')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('kind', input.kind)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  return existing.data;
}

/**
 * APIリクエストの応答後にworkerを即時キックする。失敗してもpg_cronが拾う。
 */
export function triggerWorkerTick(): void {
  const task = fetch(`${serverEnv.APP_BASE_URL}/api/internal/worker/tick`, {
    method: 'POST',
    headers: { 'X-Worker-Secret': serverEnv.WORKER_SECRET },
    body: '{}',
    signal: AbortSignal.timeout(110_000),
    redirect: 'error',
  }).then(response => {
    if (!response.ok) console.warn('[jobs] immediate worker tick returned:', response.status);
  }).catch(() => {
    console.warn('[jobs] immediate worker tick failed; queued jobs await the next tick');
  });

  try {
    after(() => task);
  } catch {
    void task;
  }
}
