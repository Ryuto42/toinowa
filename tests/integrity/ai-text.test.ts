import { describe, expect, it } from 'vitest';
import { detectAiText, verdictOf } from '@/lib/integrity/ai-text';

/** 生徒が自分で書いたような説明 */
const humanText = 'えっと、一次関数って y=ax+b のかたちで、aが傾きだと思う。'
  + 'グラフだと右上がりになるのはaがプラスのとき。たぶんbは切片で、y軸と交わるところかな。'
  + '授業で坂道のたとえを聞いて、そこはわかった気がする。';

/** 生成AIが書いたような、整った説明 */
const aiText = '一次関数とは、y = ax + b の形で表される関数です。'
  + 'ここで a は傾きを表し、グラフの傾き具合を決定します。'
  + 'また、b は y 切片を表し、グラフが y 軸と交わる点を示します。'
  + 'このように、一次関数は二つの要素によって定まります。'
  + 'さらに、a の符号によってグラフの向きが決まります。'
  + 'したがって、一次関数を理解するためには両者の役割を区別することが重要です。';

describe('detectAiText', () => {
  it('自分の言葉らしい説明は低く出る', () => {
    const result = detectAiText(humanText, { elapsedSec: 180, keystrokes: 140, typingMs: 120_000, pasteCount: 0 });
    expect(result.score).toBeLessThan(0.35);
    expect(verdictOf(result.score)).toBe('low');
  });

  it('貼り付けがあると強く反応する', () => {
    const result = detectAiText(aiText, { pasteCount: 1, elapsedSec: 200, keystrokes: 5 });
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.signals.some((s) => s.key === 'paste')).toBe(true);
  });

  it('打鍵数が文字数に対して少なすぎると検知する', () => {
    const result = detectAiText(aiText, { keystrokes: 10, elapsedSec: 300 });
    expect(result.signals.some((s) => s.key === 'keystroke_gap')).toBe(true);
  });

  it('文章量に対して送信が速すぎると検知する', () => {
    const result = detectAiText(aiText, { elapsedSec: 10 });
    expect(result.signals.some((s) => s.key === 'too_fast_for_length')).toBe(true);
  });

  it('短い相づちは何も検知しない', () => {
    const result = detectAiText('はい', { elapsedSec: 2 });
    expect(result.score).toBe(0);
    expect(result.needsJudge).toBe(false);
  });

  it('灰色のときだけLLM判定に回す', () => {
    // 手がかりが無ければ回さない
    expect(detectAiText(humanText, {}).needsJudge).toBe(false);
    // 貼り付け＋速すぎ＝真っ黒なので、LLMに聞くまでもない
    const black = detectAiText(aiText, { pasteCount: 2, elapsedSec: 3, keystrokes: 2 });
    expect(black.score).toBeGreaterThanOrEqual(0.75);
    expect(black.needsJudge).toBe(false);
  });

  it('スコアは常に 0..1 に収まる', () => {
    const result = detectAiText(aiText, { pasteCount: 99, elapsedSec: 1, keystrokes: 0, typingMs: 1 });
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('verdictOf', () => {
  it('しきい値どおりに分類する', () => {
    expect(verdictOf(0.2)).toBe('low');
    expect(verdictOf(0.5)).toBe('medium');
    expect(verdictOf(0.9)).toBe('high');
  });
});
