import 'server-only';
import { adminDb } from '@/lib/database/admin';
import type { Json } from '@/lib/database/types';
import type { JobRow, JobStepResult } from './types';
import { jobHandler } from './registry';
import './default-handlers';

export const DEFAULT_LEASE_SECONDS = 90;
export const MAX_TICK_MS = 45_000;

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

async function retryOrDeadLetter(job: JobRow, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const db = adminDb();
  if (job.attempt + 1 >= job.max_attempts) {
    const { error: deadError } = await db.rpc('fail_job_permanently', {
      p_job_id: job.id,
      p_error: message.slice(0, 2000),
    });
    if (deadError) throw new Error(`dead-letter failed: ${deadError.message}`);
    return;
  }

  const { error: retryError } = await db
    .from('jobs')
    .update({
      status: 'queued',
      run_after: new Date(Date.now() + retryDelayMs(job.attempt)).toISOString(),
      locked_until: null,
      lease_token: null,
      last_error: message.slice(0, 2000),
    })
    .eq('id', job.id)
    .eq('lease_token', job.lease_token ?? '');
  if (retryError) throw new Error(`retry job failed: ${retryError.message}`);
}

export interface WorkerTickResult {
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
}

/** 1 tickは1ジョブ1ステップだけを実行し、Vercelのタイムアウトを避ける。 */
export async function runWorkerTick(options: {
  limit?: number;
  maxDurationMs?: number;
} = {}): Promise<WorkerTickResult> {
  const started = Date.now();
  const jobs = await claimJobs(Math.min(20, Math.max(1, options.limit ?? 5)));
  const result: WorkerTickResult = {
    claimed: jobs.length,
    succeeded: 0,
    retried: 0,
    deadLettered: 0,
  };
  const maxDuration = options.maxDurationMs ?? MAX_TICK_MS;

  for (const job of jobs) {
    if (Date.now() - started >= maxDuration) break;
    const handler = jobHandler(job.kind);
    if (!handler) {
      await retryOrDeadLetter(job, new Error(`no handler registered for ${job.kind}`));
      if (job.attempt + 1 >= job.max_attempts) result.deadLettered += 1;
      else result.retried += 1;
      continue;
    }

    try {
      const next = await handler(job);
      await completeStep(job, next);
      result.succeeded += next.nextStep === null ? 1 : 0;
    } catch (error) {
      await retryOrDeadLetter(job, error);
      if (job.attempt + 1 >= job.max_attempts) result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}

export function jsonState(value: unknown): Json {
  return value as Json;
}
