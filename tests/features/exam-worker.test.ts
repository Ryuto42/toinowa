import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobRow } from '@/lib/jobs/types';
import { BudgetExceeded } from '@/lib/orcarouter/errors';
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
const page = { tables: [{ heading:'科目別成績', populationHeading:'全国', scoreColumnHeading:'得点', maxColumnHeading:'満点', deviationColumnHeading:'偏差値', meanColumnHeading:'', rows:[{ section:'subject', subject:'数学', unit:null, question:null, score:50, maxScore:100, nationalDeviation:45, nationalMeanPoints:null, uncertain:false }] }], uncertainties:[] };
const run = (state: JobRow['state'] = {}) => jobHandler('analyze_exam')!({ ...job, state });
beforeEach(() => {
  mocks.query.data = { status:'queued', images:['data:image/png;base64,test'], created_by:'admin', student_id:'student' };
  mocks.query.update.mockClear(); mocks.callModel.mockReset(); mocks.apply.mockReset();
});
describe('checkpointed exam analysis and recovery', () => {
  it('checkpoints extraction before finalizing and applies only verified results', async () => {
    mocks.callModel.mockResolvedValue({ data:page });
    const extracted = await run();
    expect(extracted.nextStep).toBe('extract_or_finalize_exam'); expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.callModel).toHaveBeenCalledWith(expect.objectContaining({ modelClass:'exam', requestType:'extract_exam' }));
    const final = await run(extracted.state!);
    expect(final.nextStep).toBeNull(); expect(mocks.callModel).toHaveBeenCalledOnce();
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ status:'completed', images:null, result:expect.objectContaining({ reviewRequired:false }) }));
    expect(mocks.apply).toHaveBeenCalledWith('tenant','analysis');
  });
  it('resumes at the next page and does not reread successfully checkpointed pages', async () => {
    mocks.query.data.images = ['page1', 'page2']; mocks.callModel.mockResolvedValue({ data:page });
    const result = await run({ protocol:'exam-v3', pages:[page], pageRetries:0 });
    expect(mocks.callModel.mock.calls[0][0].messages[1].content[0].image_url.url).toBe('page2');
    expect(result.state).toMatchObject({ pageRetries:0, pages:[page,page] });
  });
  it('retries a transient failure once, preserving prior pages, then fails without applying', async () => {
    mocks.query.data.images = ['page1','page2']; mocks.callModel.mockRejectedValue({ status:504 });
    const first = await run({ protocol:'exam-v3', pages:[page], pageRetries:0 });
    expect(first.nextStep).toBe('retry_exam_page'); expect(first.state).toMatchObject({ pages:[page], pageRetries:1 });
    expect(first.runAfter).toBeDefined();
    const last = await run(first.state!); expect(last.nextStep).toBeNull();
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ status:'failed', images:null }));
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('does not retry budget exhaustion', async () => {
    mocks.callModel.mockRejectedValue(new BudgetExceeded('tenant', 2, 1));
    expect((await run()).nextStep).toBeNull(); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('holds doubtful evidence for review and retains the source images', async () => {
    const doubtful = structuredClone(page); doubtful.tables[0].populationHeading = '校内';
    await run({ protocol:'exam-v3', pages:[doubtful], pageRetries:0 });
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ status:'review_required', images:['data:image/png;base64,test'] }));
    expect(mocks.callModel).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('retries saved-result application without another model call', async () => {
    mocks.query.data = { status:'completed' }; await run();
    expect(mocks.callModel).not.toHaveBeenCalled(); expect(mocks.apply).toHaveBeenCalledOnce();
  });
  it('never applies a review-required result on a repeated job delivery', async () => {
    mocks.query.data = { status:'review_required' }; await run();
    expect(mocks.callModel).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
  });
});
