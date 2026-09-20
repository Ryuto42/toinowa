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
    expect(Object.keys(result).sort()).toEqual(['id','conversationId','concept','encouragement','goodPoint','nextStep','pendingReview','createdAt'].sort());
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it.each(['pending_review', 'rejected', 'overridden'])('does not expose unconfirmed or superseded model advice: %s', reviewer_status => {
    expect(simplifyFeedback({ ...row, reviewer_status }, '割合', true)?.goodPoint).not.toBe('例を示せました');
  });
});
