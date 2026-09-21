import { describe, expect, it } from 'vitest';
import { canUndoSavedExchange } from '@/lib/conversation/undo';

const messages = [
  { id: 'opening', actor: 'agent', seq: 1 },
  { id: 'student1', actor: 'student', seq: 2 },
  { id: 'agent1', actor: 'agent', seq: 3 },
  { id: 'student2', actor: 'student', seq: 4 },
  { id: 'agent2', actor: 'agent', seq: 5 },
];
describe('保存済みの会話を開き直した時の取り消し', () => {
  it('返信済みの会話を再取得すれば取り消しを表示する', () => {
    expect(canUndoSavedExchange(messages, false)).toBe(true);
  });
  it('開始直後・返信待ち・完了した会話には表示しない', () => {
    expect(canUndoSavedExchange(messages.slice(0, 1), false)).toBe(false);
    expect(canUndoSavedExchange(messages.slice(0, 2), false)).toBe(false);
    expect(canUndoSavedExchange(messages, true)).toBe(false);
  });
  it('取り消し後に開き直しても、前の往復には戻せない', () => {
    expect(canUndoSavedExchange(messages.slice(0, 3), false, 'student1')).toBe(false);
  });
  it('新しい送信と返信があれば、取り消し後でも再び表示する', () => {
    expect(canUndoSavedExchange(messages, false, 'student1')).toBe(true);
    expect(canUndoSavedExchange([...messages].reverse(), false, 'student1')).toBe(true);
  });
});
