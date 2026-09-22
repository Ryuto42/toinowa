import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobRow } from '@/lib/jobs/types';
const m = vi.hoisted(() => ({ responses: new Map<string, unknown[]>(), run: vi.fn(), compute: vi.fn(), complete: vi.fn(), streak: vi.fn(), schedule: vi.fn(), plan: vi.fn(), detector: vi.fn(), filters: [] as unknown[], inserts: [] as Array<{ table: string; values: unknown }> }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/database/admin', () => ({ adminDb: () => ({ from: (table: string) => {
  const data = m.responses.get(table)?.shift();
  const q = { select: () => q, eq: () => q, gt: () => q, order: () => q, limit: () => q, single: () => q, maybeSingle: () => q, not: () => q, in: () => q, insert: (values: unknown) => { m.inserts.push({ table, values }); return q; },
    neq: (...args: unknown[]) => { m.filters.push(args); return q; }, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  return q;
} }) }));
vi.mock('@/lib/agents/catalog', () => ({ assessmentAgent: { run: m.run } }));
vi.mock('@/lib/orcarouter/call', () => ({ callModel: vi.fn() }));
vi.mock('@/lib/mastery/compute', () => ({ computeMastery: m.compute }));
vi.mock('@/lib/progress/service', () => ({ markCompleted: m.complete, updateStreak: m.streak }));
vi.mock('@/lib/mastery/review', () => ({ scheduleReview: m.schedule }));
vi.mock('@/lib/plans/followup', () => ({ queuePlanFromAssessment: m.plan }));
vi.mock('@/lib/interventions/detectors', () => ({ checkRepeatedMisconception: m.detector }));
vi.mock('@/lib/notifications/push', () => ({ pushToStudent: vi.fn() }));
import '@/lib/jobs/default-handlers';
import { jobHandler } from '@/lib/jobs/registry';
const job = { id: 'job', tenant_id: 'tenant', trace_id: 'trace', payload: { answerId: 'answer', questionId: 'question', studentId: 'student', conversationId: 'conversation' } } as unknown as JobRow;
function fixture(cached = true, seconds = 20) {
  m.responses.set('answers', [{ id: 'answer', assignment_id: 'assignment', raw_answer: '説明', hint_level: 0 }, [{ id: 'answer', raw_answer: '説明' }], [{ raw_answer: 'あ'.repeat(240), time_spent_sec: seconds }]]);
  m.responses.set('questions', [{ id: 'question', concept_id: 'concept', difficulty: 2, body: 'お題' }]);
  m.responses.set('conversations', [{ state: 'completed' }, { summary: '' }]);
  m.responses.set('assessments', [cached ? { id: 'assessment', score: 0.8 } : null, [{ score: 0.4, override_score: 0.9, evidence_answer_ids: ['prior'] }], { id: 'assessment' }]);
  m.responses.set('messages', [{ id: 'message', actor: 'student', content_redacted: '説明', seq: 1 }].map(row => [row]));
}
beforeEach(() => {
  vi.clearAllMocks(); m.responses.clear(); m.filters.length = 0; m.inserts.length = 0; fixture();
  m.complete.mockResolvedValue(undefined); m.schedule.mockResolvedValue(undefined);
  m.run.mockResolvedValue({ data: { score: 0.8, reasoningQuality: 0.8, feedback: '説明できました', strongPoints: [], attentionPoints: [], evidence: [], misconceptions: [], dimensionScores: {}, studentFeedback: {} }, meta: { runId: 'run', degraded: false } });
  m.compute.mockReturnValue({ score: 0.8, confidence: 0.9, components: [], needsReview: false });
});
describe('保存後の評価ジョブの復旧', () => {
  it('保存済み評価があれば再課金せず、完了状態・復習・次回計画まで処理する', async () => {
    await jobHandler('run_assessment')!(job);
    expect(m.run).not.toHaveBeenCalled();
    expect(m.complete).toHaveBeenCalledWith('tenant', 'assignment', 'student');
    expect(m.streak).toHaveBeenCalled();
    expect(m.schedule).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: 'assessment', score: 0.8 }));
    expect(m.plan).toHaveBeenCalledWith('tenant', 'assessment');
  });
  it('後処理が失敗したらジョブは失敗として戻し、再試行で完了まで続行する', async () => {
    m.complete.mockRejectedValueOnce(new Error('temporary database failure'));
    await expect(jobHandler('run_assessment')!(job)).rejects.toThrow('temporary');
    expect(m.plan).not.toHaveBeenCalled(); fixture();
    await jobHandler('run_assessment')!(job);
    expect(m.plan).toHaveBeenCalledOnce(); expect(m.run).not.toHaveBeenCalled();
  });
  it.each([20, 200, 1200])('入力時間 %s 秒でも回答内容の点数を減点せず、教師の修正済み評価を引き継ぐ', async seconds => {
    fixture(false, seconds); await jobHandler('run_assessment')!(job);
    expect(m.compute).toHaveBeenCalledWith(expect.objectContaining({ recent: expect.objectContaining({ score: 0.8 }), history: { scores: [0.9] } }));
    expect(m.filters).toContainEqual(['reviewer_status', 'rejected']);
  });
  it.each([
    [0.49, 'pending_review'],
    [0.51, 'auto_approved'],
  ] as const)('確信度がしきい値の前後 (%s) でレビュー状態を分ける', async (confidence, reviewerStatus) => {
    fixture(false); m.compute.mockReturnValue({ score: 0.8, confidence, components: [], needsReview: confidence < 0.5 });
    await jobHandler('run_assessment')!(job);
    expect(m.inserts.find((entry) => entry.table === 'assessments')?.values).toEqual(expect.objectContaining({ reviewer_status: reviewerStatus }));
  });
  it('縮退応答は確信度が高くても自動承認しない', async () => {
    fixture(false); m.run.mockResolvedValue({ data: { score: 0.8, reasoningQuality: 0.8, feedback: '評価できません', strongPoints: [], attentionPoints: [], evidence: [], misconceptions: [], dimensionScores: {}, studentFeedback: {} }, meta: { runId: 'run', degraded: true } });
    m.compute.mockReturnValue({ score: 0.8, confidence: 0.9, components: [], needsReview: false });
    await jobHandler('run_assessment')!(job);
    expect(m.inserts.find((entry) => entry.table === 'assessments')?.values).toEqual(expect.objectContaining({ reviewer_status: 'pending_review', score: null }));
  });
});
