import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/database/server', () => ({ createClient: vi.fn() }));
import { topicStudentContext } from '@/lib/materials/student-context';
it('課題生成へ相談・暴言・再開の発言を渡さず、学習の説明だけを使う', async () => {
  const data: Record<string, unknown> = {
    student_profiles: { grade: '高校1年' }, conversations: [{ id: 'conversation' }], assessments: [],
    messages: [
      { conversation_id: 'conversation', actor: 'student', seq: 1, content_redacted: '傾きはxが1増えたときのyの増加量です', safety_flags: {} },
      { conversation_id: 'conversation', actor: 'student', seq: 2, content_redacted: '学校でつらいことがあります', safety_flags: { student_care: ['distress'] } },
      { conversation_id: 'conversation', actor: 'agent', seq: 3, content_redacted: '安心できる場所にいますか', safety_flags: { student_care: ['distress'] } },
      { conversation_id: 'conversation', actor: 'student', seq: 4, content_redacted: 'また勉強しようかな', safety_flags: { student_care: ['resume'] } },
    ],
  };
  const database = { from: (table: string) => { const q = { select: () => q, eq: () => q, neq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: () => q, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: data[table], error: null }).then(resolve) }; return q; } };
  const result = await topicStudentContext({ tenantId: 'tenant', userId: 'teacher', role: 'teacher' }, 'student', 'classroom', database as unknown as NonNullable<Parameters<typeof topicStudentContext>[3]>);
  const history = JSON.parse(result.text);
  expect(history.conversations[0].messages).toEqual([{ speaker: 'student', text: '傾きはxが1増えたときのyの増加量です' }]);
  expect(result.text).not.toMatch(/学校でつらい|安心できる場所|また勉強/);
});
