import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ saved: { last_assessment_id: 'assessment', interval_days: 4, ease: 2.5, repetition: 2 }, upsert: vi.fn() }));
vi.mock('@/lib/database/admin', () => ({ adminDb: () => ({ from: () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: m.saved, error: null }), upsert: m.upsert }; return q;
} }) }));
import { scheduleReview } from '@/lib/mastery/review';
it('同じ評価ジョブを再試行しても、復習間隔・反復回数を二重に進めない', async () => {
  await scheduleReview({ tenantId: 'tenant', studentId: 'student', conceptId: 'concept', assessmentId: 'assessment', score: 0.9 });
  expect(m.upsert).not.toHaveBeenCalled();
});
