import { describe, expect, it } from 'vitest';
import { combinePace, evaluatePace } from '@/lib/integrity/pace';

describe('evaluatePace', () => {
  it('短い相づちは時間で判断しない', () => {
    expect(evaluatePace(4, 1).verdict).toBe('unknown');
    expect(evaluatePace(4, 1).factor).toBe(1);
  });

  it('計測できていない場合は減点しない', () => {
    expect(evaluatePace(300, null).verdict).toBe('unknown');
    expect(evaluatePace(300, 0).factor).toBe(1);
  });

  it('文字数に対して速すぎると too_fast', () => {
    // 240文字の想定所要は約200秒。20秒は明らかに速い
    const result = evaluatePace(240, 20);
    expect(result.verdict).toBe('too_fast');
    expect(result.factor).toBe(0.85);
    expect(result.reason).toContain('240文字');
  });

  it('妥当な速さなら減点しない', () => {
    const result = evaluatePace(240, 200);
    expect(result.verdict).toBe('expected');
    expect(result.factor).toBe(1);
    expect(result.reason).toBe('');
  });

  it('時間がかかりすぎると too_slow', () => {
    const result = evaluatePace(240, 1200);
    expect(result.verdict).toBe('too_slow');
    expect(result.factor).toBe(0.9);
  });

  it('16分以上かかれば、比率が範囲内でも too_slow', () => {
    // 2000文字なら想定1667秒。1000秒は比率上は妥当だが…
    expect(evaluatePace(2000, 1000).verdict).toBe('expected');
    // 15分を超えたら離席とみなす
    expect(evaluatePace(2000, 1000 + 15 * 60).verdict).toBe('too_slow');
  });

  it('減点は最大でも15%に留める', () => {
    for (const [chars, sec] of [[240, 1], [240, 99999], [100, 2]] as const) {
      expect(evaluatePace(chars, sec).factor).toBeGreaterThanOrEqual(0.85);
    }
  });
});

describe('combinePace', () => {
  it('最も低い係数を採る', () => {
    const result = combinePace([evaluatePace(240, 200), evaluatePace(240, 20)]);
    expect(result.verdict).toBe('too_fast');
  });

  it('判定できるものが無ければ減点しない', () => {
    expect(combinePace([evaluatePace(4, 1)]).factor).toBe(1);
    expect(combinePace([]).factor).toBe(1);
  });
});
