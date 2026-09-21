import 'server-only';
import { z } from 'zod';
import { SafetyBlocked, isRetryable } from '@/lib/orcarouter/errors';
import { adminDb } from '@/lib/database/admin';
import type { Json } from '@/lib/database/types';
import type { JobRow, JobStepResult } from './types';
import { jobHandler } from './registry';
import './default-handlers';
import './plan-handler';
import './exam-handler';

export const DEFAULT_LEASE_SECONDS = 180;
export const MAX_TICK_MS = 100_000;

export function retryDelayMs(attempt: number, random = Math.random()): number {
  const base = Math.min(300, 2 ** Math.max(0, attempt));
  return Math.round(base * 1000 * (1 + Math.min(1, Math.max(0, random)) * 0.3));
}

export { clearJobHandlersForTests } from './registry';
export { registerJobHandler } from './registry';

function rowsFromRpc(data: unknown): JobRow[] {
  return Array.isArray(data) ? (data as JobRow[]) : [];
}

async function claimJobs(limit: number): Promise<JobRow[]> {
  const { data, error } = await adminDb().rpc('claim_jobs', {
    p_limit: limit,
    p_lease_sec: DEFAULT_LEASE_SECONDS,
  });
  if (error) throw new Error(`claim_jobs failed: ${error.message}`);
  return rowsFromRpc(data);
}

async function completeStep(job: JobRow, result: JobStepResult): Promise<void> {
  const db = adminDb();
  const update = {
    status: result.nextStep === null ? ('succeeded' as const) : ('queued' as const),
    step: result.nextStep ?? job.step,
    state: result.state ?? job.state,
    run_after: result.runAfter ?? new Date().toISOString(),
    locked_until: null,
    lease_token: null,
    last_error: null,
  };
  const { error } = await db
    .from('jobs')
    .update(update)
    .eq('id', job.id)
    .eq('lease_token', job.lease_token ?? '');
  if (error) throw new Error(`complete job failed: ${error.message}`);
}

async function retryOrDeadLetter(job: JobRow, error: unknown): Promise<'retried' | 'deadLettered' | 'leaseLost'> {
  const message = error instanceof Error ? error.message : String(error);
  const db = adminDb();
  if (job.attempt + 1 >= job.max_attempts || error instanceof SafetyBlocked || error instanceof z.ZodError || !isRetryable(error)) {
    const { data: removed, error: deadError } = await db.rpc('fail_leased_job', {
      p_job_id: job.id,
      p_lease_token: job.lease_token ?? '',
      p_error: message.slice(0, 2000),
    });
    if (deadError) throw new Error(`dead-letter failed: ${deadError.message}`);
    return removed ? 'deadLettered' : 'leaseLost';
  }

  const { error: retryError } = await db
    .from('jobs')
    .update({
      status: 'queued',
      attempt: job.attempt + 1,
      run_after: new Date(Date.now() + retryDelayMs(job.attempt)).toISOString(),
      locked_until: null,
      lease_token: null,
      last_error: message.slice(0, 2000),
    })
    .eq('id', job.id)
    .eq('lease_token', job.lease_token ?? '');
  if (retryError) throw new Error(`retry job failed: ${retryError.message}`);
  return 'retried';
}

export interface WorkerTickResult {
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
}

/** 1 tickは1ジョブ1ステップだけを実行し、Vercelのタイムアウトを避ける。 */
export async function runWorkerTick(options: {
  limit?: number;
  maxDurationMs?: number;
} = {}): Promise<WorkerTickResult> {
  const started = Date.now();
  const limit = Math.min(20, Math.max(1, options.limit ?? 1));
  const result: WorkerTickResult = {
    claimed: 0,
    succeeded: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
  };
  const maxDuration = options.maxDurationMs ?? MAX_TICK_MS;

  for (let index = 0; index < limit; index++) {
    if (Date.now() - started >= maxDuration) break;
    // 実行直前に1件だけ取得。未着手ジョブをリースしたまま時間切れにしない。
    const [job] = await claimJobs(1);
    if (!job) break;
    result.claimed += 1;
    if (job.attempt >= job.max_attempts) {
      result[await retryOrDeadLetter(job, new Error('retry limit reached'))] += 1;
      continue;
    }
    const handler = jobHandler(job.kind);
    if (!handler) {
      result[await retryOrDeadLetter(job, { status: 400, message: 'unknown job kind' })] += 1;
      continue;
    }

    try {
      const next = await handler(job);
      await completeStep(job, next);
      result.succeeded += next.nextStep === null ? 1 : 0;
    } catch (error) {
      result[await retryOrDeadLetter(job, error)] += 1;
    }
  }
  return result;
}

export function jsonState(value: unknown): Json {
  return value as Json;
}
