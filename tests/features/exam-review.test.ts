import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const query = { select:vi.fn(() => query), eq:vi.fn(() => query), update:vi.fn(() => query), maybeSingle:vi.fn() };
  return { query, apply:vi.fn(), role:vi.fn() };
});
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/guard', () => ({ requireRole:mocks.role }));
vi.mock('@/lib/database/admin', () => ({ adminDb:() => ({ from:() => mocks.query }) }));
vi.mock('@/lib/materials/apply-exam-analysis', () => ({ applyExamAnalysis:mocks.apply }));
import { POST } from '@/app/api/admin/exam-analyses/[id]/route';
const id='00000000-0000-4000-8000-000000000001';
const proposal={ text:'数学 50/100 全国偏差値45', learningGoal:'基礎を復習', weakAreas:'数学', dailyTimeLimitMin:20, rationale:'確認済み', uncertainties:[] };
const route={ params:Promise.resolve({ id }) };
function request(body:unknown) { return new Request('http://localhost/api/admin/exam-analyses/'+id, { method:'POST', body:JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.query.maybeSingle.mockReset(); mocks.role.mockResolvedValue({ tenantId:'tenant', userId:'admin' }); });
describe('exam review approval boundary', () => {
  it('requires explicit confirmation and performs no write when absent', async () => {
    expect((await POST(request({ result:proposal }),route)).status).toBe(400); expect(mocks.query.update).not.toHaveBeenCalled();
  });
  it('scopes review to the tenant and uploader, preserving original evidence', async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data:{ status:'review_required', result:{ extraction:{ version:3 }, originalProposal:{ text:'before' } } } }).mockResolvedValueOnce({ data:{ id } });
    expect((await POST(request({ confirmed:true, result:{ ...proposal, reviewedBy:'attacker' } }),route)).status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith('admin');
    expect(mocks.query.eq).toHaveBeenCalledWith('tenant_id','tenant'); expect(mocks.query.eq).toHaveBeenCalledWith('created_by','admin');
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ status:'completed', images:null, result:expect.objectContaining({ extraction:{ version:3 }, originalProposal:{ text:'before' }, reviewedBy:'admin', reviewRequired:false }) }));
    expect(mocks.apply).toHaveBeenCalledWith('tenant',id);
  });
  it('does not approve someone else’s or missing analysis', async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data:null });
    expect((await POST(request({ confirmed:true, result:proposal }),route)).status).toBe(404); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('retries application after approval without overwriting the saved result', async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data:{ status:'completed', result:{ reviewedBy:'admin', ...proposal } } });
    expect((await POST(request({ confirmed:true, result:{ ...proposal, text:'different' } }),route)).status).toBe(200);
    expect(mocks.query.update).not.toHaveBeenCalled(); expect(mocks.apply).toHaveBeenCalledOnce();
  });
});
