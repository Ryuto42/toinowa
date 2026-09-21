import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CareMessage } from '@/lib/security/student-care';
const m = vi.hoisted(() => ({
  messages: [] as Array<CareMessage & { id: string; seq: number }>,
  purpose: 'learning', classify: vi.fn(), escalation: vi.fn(), audit: vi.fn(),
  append: vi.fn(), answer: vi.fn(), complete: vi.fn(), learn: vi.fn(), tutorial: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/auth/guard', () => ({ requireAuth: async () => ({ tenantId: 'tenant', userId: 'student', role: 'student' }) }));
vi.mock('@/lib/api/http', () => ({
  json: (data: unknown) => Response.json(data), parseJson: (req: Request) => req.json(),
  uuidParam: (value: string) => value, traceIdFrom: () => 'trace', routeError: () => Response.json({ error: true }, { status: 500 }),
}));
vi.mock('@/lib/database/admin', () => ({ adminDb: vi.fn(() => { throw new Error('unexpected DB access'); }) }));
vi.mock('@/lib/conversation/service', () => ({
  getConversation: async () => ({ student_id: 'student', state: 'active', purpose: m.purpose, message_count: m.messages.length, concept_id: 'concept' }),
  listMessages: async () => [...m.messages], appendMessage: m.append, completeConversation: m.complete,
  recordConversationAnswer: m.answer, maybeQueueConversationSummary: vi.fn(), messageCreateSchema: {},
}));
vi.mock('@/lib/security/student-care-agent', () => ({ classifyStudentCare: m.classify }));
vi.mock('@/lib/security/audit', () => ({ recordGuardEvent: m.audit }));
vi.mock('@/lib/security/escalate', () => ({ reportSafetyBlock: vi.fn() }));
vi.mock('@/lib/interventions/raise', () => ({ classroomOfStudent: async () => null, raiseEscalation: m.escalation }));
vi.mock('@/lib/agents/catalog', () => ({ learningSupportAgent: { run: m.learn } }));
vi.mock('@/lib/tutorial/agent', () => ({ tutorialAgent: { run: m.tutorial } }));
vi.mock('@/lib/tutorial/student', () => ({ studentTutorialAudience: async () => 'general' }));
vi.mock('@/lib/integrity/record', () => ({ recordAnswerIntegrity: vi.fn() }));
import { POST } from '@/app/api/conversations/[id]/messages/route';
const send = (content: string, stream = false) => POST(new Request('http://localhost/messages', {
  method: 'POST', body: JSON.stringify({ content, assignmentId: 'assignment', questionId: 'question', stream }),
}), { params: Promise.resolve({ id: 'conversation' }) });

beforeEach(() => {
  vi.clearAllMocks(); m.messages = []; m.purpose = 'learning';
  m.classify.mockResolvedValue({ category: 'distress', evidence: '助けて', reason: '助けを求めている', source: 'model' });
  m.escalation.mockResolvedValue('escalation');
  m.append.mockImplementation(async (input: { actor: string; content: string; careLabel?: string }) => {
    const row = { id: `message${m.messages.length}`, seq: m.messages.length + 1, actor: input.actor, content_redacted: input.content,
      safety_flags: input.careLabel ? { student_care: [input.careLabel] } : {} };
    m.messages.push(row); return row;
  });
});
describe('相談・暴言の実際のメッセージAPI分岐', () => {
  it('課題の問い返し・回答採点・自動終了へ進まず、その場で相談を受け止める', async () => {
    m.messages = Array.from({ length: 6 }, (_, seq) => ({ actor: 'student', content_redacted: '以前の説明', id: String(seq), seq }));
    const response = await send('学校に行きたくないです助けてください');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ conversationCompleted: false, message: expect.stringContaining('勉強を休んで大丈夫') });
    expect(m.escalation).toHaveBeenCalledWith(expect.objectContaining({ kind: 'distress', priority: 'high', payload: expect.objectContaining({ conversationId: 'conversation', messageId: 'message6' }) }));
    expect(m.learn).not.toHaveBeenCalled(); expect(m.answer).not.toHaveBeenCalled(); expect(m.complete).not.toHaveBeenCalled();
  });
  it('初回チュートリアルでも学習回数や終了より相談を優先する', async () => {
    m.purpose = 'tutorial'; await send('助けて');
    expect(m.tutorial).not.toHaveBeenCalled(); expect(m.complete).not.toHaveBeenCalled();
  });
  it('短い相づちでも相談状態を維持し、明示的な再開を保存する', async () => {
    await send('助けて');
    m.classify.mockResolvedValue({ category: 'normal', reason: '', source: 'model' });
    expect((await (await send('ありがとう')).json()).message).toContain('無理に詳しく');
    expect(m.learn).not.toHaveBeenCalled();
    expect((await (await send('勉強に戻る')).json()).message).toContain('元のお題');
    expect(m.messages.at(-1)?.safety_flags).toEqual({ student_care: ['resume'] });
    expect(m.answer).not.toHaveBeenCalled();
  });
  it('暴言の初回は穏やかな注意、繰り返した時に緊急ではない要フォロー', async () => {
    m.classify.mockResolvedValue({ category: 'hostility', evidence: 'ばーかばーか', reason: '相手への暴言', source: 'model' });
    expect((await (await send('ばーかばーか')).json()).message).toContain('相手を傷つける言葉');
    expect(m.escalation).not.toHaveBeenCalled();
    await send('ばーかばーか');
    expect(m.escalation).toHaveBeenCalledWith(expect.objectContaining({ kind: 'safety', priority: 'medium' }));
    expect(m.complete).not.toHaveBeenCalled();
  });
  it('記録が失敗しても支援の返答を返し、先生に届いたと偽らない', async () => {
    m.escalation.mockResolvedValue(null);
    const payload = await (await send('助けて')).json();
    expect(payload.message).toContain('記録を完了できません');
    expect(payload.conversationCompleted).toBe(false);
  });
  it('SSEでも相談応答を返し、命の危険はurgentにする', async () => {
    m.classify.mockResolvedValue({ category: 'self_harm', reason: '本人の相談', source: 'rule' });
    const response = await send('生きていたくない', true);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('event: done');
    expect(m.escalation).toHaveBeenCalledWith(expect.objectContaining({ priority: 'urgent' }));
  });
});
