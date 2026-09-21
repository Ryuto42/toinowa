import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobRow } from '@/lib/jobs/types';
const mocks = vi.hoisted(() => {
  const query = { data: {} as Record<string, unknown>, error: null, select: vi.fn(() => query), eq: vi.fn(() => query), single: vi.fn(() => query), update: vi.fn(() => query) };
  return { query, callModel: vi.fn(), apply: vi.fn() };
});
vi.mock('server-only', () => ({}));
vi.mock('@/lib/database/admin', () => ({ adminDb: () => ({ from: () => mocks.query }) }));
vi.mock('@/lib/orcarouter/call', () => ({ callModel: mocks.callModel }));
vi.mock('@/lib/materials/apply-exam-analysis', () => ({ applyExamAnalysis: mocks.apply }));
import '@/lib/jobs/exam-handler';
import { jobHandler } from '@/lib/jobs/registry';
const job: JobRow = { id:'job', tenant_id:'tenant', trace_id:'trace', payload:{ analysisId:'analysis' }, kind:'analyze_exam', idempotency_key:'exam:analysis', status:'leased', priority:1, step:'start', state:{}, attempt:0, max_attempts:3, run_after:'2026-09-21T00:00:00Z', locked_until:null, lease_token:'lease', last_error:null, created_at:'2026-09-21T00:00:00Z', updated_at:'2026-09-21T00:00:00Z' };
const output = { text:'数学50点', learningGoal:'関数を復習する', weakAreas:'グラフ', dailyTimeLimitMin:20, rationale:'単元別得点からの提案', uncertainties:[] };
beforeEach(() => {
  mocks.query.data = { status:'queued', images:['data:image/png;base64,test'], created_by:'admin', student_id:'student' };
  mocks.query.update.mockClear(); mocks.callModel.mockReset(); mocks.apply.mockReset();
});
describe('background worker completion and recovery', () => {
  it('persists results, discards images and applies to the registered student', async () => {
    mocks.callModel.mockResolvedValue({ data:output });
    expect(await jobHandler('analyze_exam')!(job)).toEqual({ nextStep:null });
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ status:'completed', images:null, result:output }));
    expect(mocks.apply).toHaveBeenCalledWith('tenant','analysis');
  });
  it('exposes a failure and discards images without applying fabricated results', async () => {
    mocks.callModel.mockRejectedValue(new Error('budget exhausted'));
    await jobHandler('analyze_exam')!(job);
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ status:'failed', images:null }));
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('retries saved-result application without paying for another analysis', async () => {
    mocks.query.data = { status:'completed', result:output };
    await jobHandler('analyze_exam')!(job);
    expect(mocks.callModel).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalledOnce();
  });
});
