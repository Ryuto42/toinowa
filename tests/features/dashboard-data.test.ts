import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tables: new Map<string, { data: unknown; count?: number; error: unknown }>(), dates: [] as string[] }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/guard', () => ({ requireRole: async () => ({ tenantId: 'tenant', userId: 'student' }) }));
vi.mock('@/components/student/tutorial-entry', () => ({ TutorialEntry: () => null }));
vi.mock('@/components/teacher/ops-auto-refresh', () => ({ OpsAutoRefresh: () => null }));
vi.mock('@/lib/database/server', () => ({ createClient: async () => ({ from: (table: string) => {
  let cap: number | undefined;
  const q = { select: () => q, eq: () => q, neq: () => q, order: () => q, in: () => q, is: () => q, maybeSingle: () => q,
    gte: (column: string) => { m.dates.push(column); return q; }, limit: (n: number) => { cap = n; return q; },
    then: (resolve: (value: unknown) => unknown) => { const result = m.tables.get(table) ?? { data: [], count: 0, error: null }; return Promise.resolve({ ...result, data: cap && Array.isArray(result.data) ? result.data.slice(0, cap) : result.data }).then(resolve); } };
  return q;
} }) }));
import StudentHomePage from '@/app/student/home/page';
import TeacherDashboardPage from '@/app/teacher/dashboard/page';
function allProps(tree: React.ReactNode): Record<string, unknown>[] {
  if (Array.isArray(tree)) return tree.flatMap(allProps);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree.props, ...allProps(tree.props.children as React.ReactNode)];
}
beforeEach(() => { m.tables.clear(); m.dates.length = 0; vi.stubGlobal('React', React); });
describe('ダッシュボードが未完了の仕事を隠さない', () => {
  it('古い完了済み8件があっても、その後の未着手課題を表示する', async () => {
    m.tables.set('assignments', { error: null, data: Array.from({ length: 9 }, (_, n) => ({ id: `work-${n}`, status: 'published', due_at: null, lessons: { title: `お題${n}` }, question_ids: ['question'] })) });
    m.tables.set('assignment_progress', { error: null, data: Array.from({ length: 8 }, (_, n) => ({ assignment_id: `work-${n}`, status: 'completed' })) });
    const props = allProps(await StudentHomePage());
    expect(props.find(row => row.label === '今日やること')?.value).toBe(1);
    expect(props.some(row => row.href === '/student/study/work-8')).toBe(true);
  });
  it('取得障害を「すべて完了」として扱わない', async () => {
    m.tables.set('assignment_progress', { data: null, error: { message: 'connection unavailable' } });
    await expect(StudentHomePage()).rejects.toThrow('connection unavailable');
  });
  it('提出日時を集計し、5件より多い要フォローと複数生徒の評価を数える', async () => {
    m.tables.set('escalations', { error: null, count: 7, data: Array.from({ length: 7 }, (_, n) => ({ id: String(n), status: 'open' })) });
    m.tables.set('assessments', { error: null, data: [
      { student_id: 'a', concept_id: 'x', score: 0.8, override_score: null },
      { student_id: 'b', concept_id: 'x', score: 0.2, override_score: 0.6 },
      { student_id: 'a', concept_id: 'x', score: 0.1, override_score: null },
    ] });
    const props = allProps(await TeacherDashboardPage());
    expect(m.dates).toEqual(['answered_at']);
    expect(props.find(row => row.label === '要フォロー')?.value).toBe(7);
    expect(props.find(row => row.label === '平均理解度')?.value).toBe('70%');
  });
});
