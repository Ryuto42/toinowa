import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SafetyBlocked } from '@/lib/orcarouter/errors';
import type { JobRow } from '@/lib/jobs/types';
const mocks = vi.hoisted(() => {
  const query = { error: null, update: vi.fn(() => query), eq: vi.fn(() => query) };
  return { rpc: vi.fn(), query };
});
vi.mock('server-only', () => ({}));
vi.mock('@/lib/database/admin', () => ({ adminDb: () => ({ rpc: mocks.rpc, from: () => mocks.query }) }));
vi.mock('@/lib/jobs/default-handlers', () => ({}));
vi.mock('@/lib/jobs/plan-handler', () => ({}));
import { runWorkerTick, clearJobHandlersForTests, registerJobHandler } from '@/lib/jobs/worker';
const job = { id: 'job1', tenant_id: 'school1', kind: 'test', lease_token: 'lease1', attempt: 0, max_attempts: 5, state: {} } as JobRow;
beforeEach(() => { vi.restoreAllMocks(); mocks.rpc.mockReset(); mocks.query.update.mockClear(); clearJobHandlersForTests(); });
describe('worker recovery', () => {
  it('claims only the work it can start within the deadline', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    mocks.rpc.mockResolvedValue({ data: [job], error: null });
    registerJobHandler('test', async () => { now = 110; return { nextStep: null }; });
    const result = await runWorkerTick({ limit: 10, maxDurationMs: 100 });
    expect(result).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_jobs', expect.objectContaining({ p_limit: 1 }));
  });
  it('never retries a prompt safety block and checks lease ownership before removal', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [job], error: null }).mockResolvedValue({ data: true, error: null });
    registerJobHandler('test', async () => { throw new SafetyBlocked('app_rule', 'injection'); });
    const result = await runWorkerTick();
    expect(result.deadLettered).toBe(1);
    expect(mocks.rpc).toHaveBeenLastCalledWith('fail_leased_job', expect.objectContaining({ p_job_id: job.id, p_lease_token: job.lease_token }));
    expect(mocks.query.update).not.toHaveBeenCalled();
  });
  it('does not count a stale lease as a removed job', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [job], error: null }).mockResolvedValue({ data: false, error: null });
    registerJobHandler('test', async () => { throw new SafetyBlocked('app_rule', 'injection'); });
    expect(await runWorkerTick()).toMatchObject({ deadLettered: 0, leaseLost: 1 });
  });
  it('requeues transient outages under the same lease', async () => {
    mocks.rpc.mockResolvedValue({ data: [job], error: null });
    registerJobHandler('test', async () => { throw new Error('network unavailable'); });
    expect((await runWorkerTick()).retried).toBe(1);
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', attempt: 1, lease_token: null }));
    expect(mocks.query.eq).toHaveBeenCalledWith('lease_token', 'lease1');
  });
  it('does not run an exhausted reclaimed job', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...job, attempt: 5 }], error: null }).mockResolvedValue({ data: true, error: null });
    const handler = vi.fn(); registerJobHandler('test', handler);
    expect((await runWorkerTick()).deadLettered).toBe(1);
    expect(handler).not.toHaveBeenCalled();
  });
});
