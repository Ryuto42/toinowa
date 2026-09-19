import { describe, expect, it } from 'vitest';
import { decideDifficulty, type DifficultyInput } from '@/lib/mastery/difficulty';

function input(p: Partial<DifficultyInput> = {}): DifficultyInput {
  return {
    current: 3,
    recentScoresAtLevel: [0.5, 0.5],
    recentReasoningQuality: [0.5, 0.5],
    recentHintsUsed: [1, 1],
    recentMisconceptionCodes: [[], [], []],
    reasoningAfterHints: null,
    avgDailyMinutes7d: 20,
    dailyTimeLimitMin: 30,
    ...p,
  };
}

describe('decideDifficulty: 昇格', () => {
  it('2回連続0.8以上 かつ ヒント少 かつ 過程が妥当なら1段上げる', () => {
    const d = decideDifficulty(
      input({
        recentScoresAtLevel: [0.9, 0.85],
        recentReasoningQuality: [0.8, 0.8],
        recentHintsUsed: [0, 1],
      }),
    );
    expect(d.direction).toBe('promote');
    expect(d.next).toBe(4);
    expect(d.reason).toContain('2回続けて');
  });

  it('正答してもヒント依存が高ければ上げない', () => {
    const d = decideDifficulty(
      input({
        recentScoresAtLevel: [0.9, 0.9],
        recentReasoningQuality: [0.9, 0.9],
        recentHintsUsed: [3, 3],
      }),
    );
    expect(d.direction).toBe('hold');
    expect(d.reason).toContain('ヒントに頼らず');
  });

  it('正答しても解答過程が不十分なら上げない', () => {
    const d = decideDifficulty(
      input({
        recentScoresAtLevel: [1, 1],
        recentReasoningQuality: [0.3, 0.3],
        recentHintsUsed: [0, 0],
      }),
    );
    expect(d.direction).toBe('hold');
    expect(d.reason).toContain('考え方の筋道');
  });

  it('レベル5では昇格させず維持する', () => {
    const d = decideDifficulty(
      input({
        current: 5,
        recentScoresAtLevel: [1, 1],
        recentReasoningQuality: [1, 1],
        recentHintsUsed: [0, 0],
      }),
    );
    expect(d.next).toBe(5);
    expect(d.direction).toBe('hold');
  });
});

describe('decideDifficulty: 降格', () => {
  it('同じ誤概念が直近3回中2回出たら1段下げる', () => {
    const d = decideDifficulty(
      input({ recentMisconceptionCodes: [['M-SLP-002'], [], ['M-SLP-002']] }),
    );
    expect(d.direction).toBe('demote');
    expect(d.next).toBe(2);
    expect(d.reason).toContain('M-SLP-002');
  });

  it('ヒント後も解答過程が不安定なら下げる', () => {
    const d = decideDifficulty(input({ reasoningAfterHints: 0.3 }));
    expect(d.direction).toBe('demote');
    expect(d.reason).toContain('ヒントを見たあとも');
  });

  it('学習時間が本人の上限を超えていたら下げる', () => {
    const d = decideDifficulty(
      input({ avgDailyMinutes7d: 55, dailyTimeLimitMin: 30 }),
    );
    expect(d.direction).toBe('demote');
    expect(d.reason).toContain('55分');
  });

  it('降格判定は昇格条件より優先される', () => {
    const d = decideDifficulty(
      input({
        recentScoresAtLevel: [1, 1],
        recentReasoningQuality: [1, 1],
        recentHintsUsed: [0, 0],
        recentMisconceptionCodes: [['M-X'], ['M-X'], []],
      }),
    );
    expect(d.direction).toBe('demote');
  });

  it('レベル1より下には行かない', () => {
    const d = decideDifficulty(
      input({ current: 1, reasoningAfterHints: 0.1 }),
    );
    expect(d.next).toBe(1);
  });
});

describe('decideDifficulty: 共通', () => {
  it('1回の評価で2段階以上動かさない', () => {
    for (let lv = 1; lv <= 5; lv++) {
      const cases: DifficultyInput[] = [
        input({ current: lv as 1, recentScoresAtLevel: [1, 1], recentReasoningQuality: [1, 1], recentHintsUsed: [0, 0] }),
        input({ current: lv as 1, reasoningAfterHints: 0 }),
        input({ current: lv as 1, avgDailyMinutes7d: 999 }),
      ];
      for (const c of cases) {
        expect(Math.abs(decideDifficulty(c).next - lv)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('どの判定でも必ず日本語の理由が付く', () => {
    const d = decideDifficulty(input());
    expect(d.reason.length).toBeGreaterThan(10);
  });
});
