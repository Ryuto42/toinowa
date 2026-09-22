import { describe, expect, it } from 'vitest';
import { combinePace, evaluatePace } from '@/lib/integrity/pace';

describe('evaluatePace', () => {
  it('短い相づちは時間で判断しない', () => {
    expect(evaluatePace(4, 1).verdict).toBe('unknown');
    expect(evaluatePace(4, 1)).not.toHaveProperty('factor');
  });

  it('計測できていない場合は減点しない', () => {
    expect(evaluatePace(300, null).verdict).toBe('unknown');
    expect(evaluatePace(300, 0)).not.toHaveProperty('factor');
  });

  it('文字数に対して速すぎると too_fast', () => {
    // 240文字の想定所要は約200秒。20秒は明らかに速い
    const result = evaluatePace(240, 20);
    expect(result.verdict).toBe('too_fast');
    expect(result).not.toHaveProperty('factor');
    expect(result.reason).toContain('240文字');
  });

  it('妥当な速さなら減点しない', () => {
    const result = evaluatePace(240, 200);
    expect(result.verdict).toBe('expected');
    expect(result).not.toHaveProperty('factor');
    expect(result.reason).toBe('');
  });

  it('時間がかかりすぎると too_slow', () => {
    const result = evaluatePace(240, 1200);
    expect(result.verdict).toBe('too_slow');
    expect(result).not.toHaveProperty('factor');
  });

  it('16分以上かかれば、比率が範囲内でも too_slow', () => {
    // 2000文字なら想定1667秒。800秒は比率上も範囲内で、15分未満。
    expect(evaluatePace(2000, 800).verdict).toBe('expected');
    // 15分を超えたら離席とみなす
    expect(evaluatePace(2000, 15 * 60 + 1).verdict).toBe('too_slow');
  });

  it('入力速度から理解度を自動減点する係数を返さない', () => {
    for (const [chars, sec] of [[240, 1], [240, 99999], [100, 2]] as const) {
      expect(evaluatePace(chars, sec)).not.toHaveProperty('factor');
    }
  });
});

describe('combinePace', () => {
  it('確認が必要な観測を優先する', () => {
    const result = combinePace([evaluatePace(240, 200), evaluatePace(240, 20)]);
    expect(result.verdict).toBe('too_fast');
  });

  it('判定できるものが無ければ減点しない', () => {
    expect(combinePace([evaluatePace(4, 1)]).verdict).toBe('unknown');
    expect(combinePace([]).verdict).toBe('unknown');
  });
});
