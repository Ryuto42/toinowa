import { describe, expect, it } from 'vitest';
import { simplifyFeedback } from '@/lib/mastery/feedback';
const row = { id: 'a', conversation_id: 'c', is_final: true, component_scores: { studentFeedback: { goodPoint: '例を示せました', nextStep: '理由もつなげよう' }, dimensions: { logic: 0.1 }, misconceptions: ['secret'] }, reviewer_status: 'approved', created_at: '2026-09-20' };
describe('student feedback privacy', () => {
  it('blocks unfinished conversations and interim evaluations', () => {
    expect(simplifyFeedback(row, '割合', false)).toBeNull();
    expect(simplifyFeedback({ ...row, is_final: false }, '割合', true)).toBeNull();
    expect(simplifyFeedback({ ...row, conversation_id: null }, '割合', true)).toBeNull();
  });
  it('returns only the simple projection without teacher details', () => {
    const result = simplifyFeedback(row, '割合', true)!;
    expect(result.goodPoint).toBe('例を示せました');
    expect(Object.keys(result).sort()).toEqual(['id','conversationId','concept','lesson','goodPoint','nextStep','review','level','completedAt','createdAt'].sort());
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('shows how the explanation went without revealing the score', () => {
    const at = (values: object) => simplifyFeedback({ ...row, ...values }, '割合', true)!;
    expect(at({ score: 0.9 }).level).toBe('strong');
    expect(at({ score: 0.5 }).level).toBe('steady');
    expect(at({ score: 0.2 }).level).toBe('retry');
    expect(at({ score: null }).level).toBeNull();
    // 先生がつけ直した点数があればそちらを使い、確認待ちでは手応えも出さない。
    expect(at({ reviewer_status: 'overridden', score: 0.2, override_score: 0.9 }).level).toBe('strong');
    expect(at({ reviewer_status: 'pending_review', score: 0.9 }).level).toBeNull();
    expect(JSON.stringify(at({ score: 0.86 }))).not.toContain('0.86');
  });
  it.each([['pending_review','pending'],['rejected','pending'],['overridden','revised']])('does not expose unconfirmed or superseded model advice: %s', (reviewer_status, review) => {
    const result = simplifyFeedback({ ...row, reviewer_status }, '割合', true)!;
    // 定型文で埋めず、どの状態で止まっているか分かるようにする。
    expect(result.goodPoint).toBeNull(); expect(result.nextStep).toBeNull(); expect(result.review).toBe(review);
  });
  it('keeps the assignment identifiable on each card', () => {
    const result = simplifyFeedback({ ...row, score: 0.86 }, '割合', true, { lesson: '一次関数のまとめ', completedAt: '2026-09-21' })!;
    expect(result).toMatchObject({ concept: '割合', lesson: '一次関数のまとめ', completedAt: '2026-09-21', review: 'confirmed', level: 'strong' });
  });
});
