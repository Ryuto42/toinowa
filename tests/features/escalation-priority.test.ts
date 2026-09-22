import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), update: vi.fn(), error: null as null | { message: string } };
  return { query };
});
vi.mock('@/lib/database/admin', () => ({ adminDb: () => ({ from: () => m.query }) }));
import { raiseEscalation } from '@/lib/interventions/raise';
beforeEach(() => {
  vi.clearAllMocks(); m.query.error = null;
  for (const method of ['select', 'eq', 'in', 'gte', 'limit', 'update'] as const) m.query[method].mockReturnValue(m.query);
});
describe('相談の優先度更新', () => {
  it('同じ相談が深刻になったら、重複抑制しても緊急へ引き上げる', async () => {
    m.query.maybeSingle.mockResolvedValue({ data: { id: 'case', priority: 'high', title: '相談', payload: { occurrences: 1 } } });
    expect(await raiseEscalation({ tenantId: 'tenant', studentId: 'student', kind: 'distress', priority: 'urgent', title: '命の安全', payload: { category: 'self_harm' } })).toBe('case');
    expect(m.query.update).toHaveBeenCalledWith(expect.objectContaining({ priority: 'urgent', title: '命の安全', payload: expect.objectContaining({ occurrences: 2, category: 'self_harm' }) }));
    expect(m.query.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
  });
  it('後から軽い発言が来ても緊急の優先度と根拠を下げない', async () => {
    m.query.maybeSingle.mockResolvedValue({ data: { id: 'case', priority: 'urgent', title: '命の安全', payload: { category: 'self_harm', excerpt: '深刻な相談' } } });
    await raiseEscalation({ tenantId: 'tenant', studentId: 'student', kind: 'distress', priority: 'high', title: '相談', payload: { category: 'distress', excerpt: 'ありがとう' } });
    const update = m.query.update.mock.calls[0][0];
    expect(update.priority).toBeUndefined(); expect(update.title).toBeUndefined();
    expect(update.payload).toMatchObject({ category: 'self_harm', excerpt: '深刻な相談', latest_observation: { excerpt: 'ありがとう' } });
  });
  it('保存エラー時は成功IDを返さない', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.query.maybeSingle.mockResolvedValue({ data: { id: 'case', priority: 'high', payload: {} } });
    m.query.error = { message: 'update failed' };
    expect(await raiseEscalation({ tenantId: 'tenant', studentId: 'student', kind: 'distress', priority: 'high', title: '相談' })).toBeNull();
    log.mockRestore();
  });
});
