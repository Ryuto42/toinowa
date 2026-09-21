import { describe, expect, it } from 'vitest';
import { nextReview } from '@/lib/mastery/review-schedule';

describe('nextReview', () => {
  it('初回に説明できていれば翌日に置く', () => {
    expect(nextReview(0.9, null)).toMatchObject({ intervalDays: 1, repetition: 1 });
  });

  it('2回続けて説明できれば4日後に伸びる', () => {
    const first = nextReview(0.9, null);
    expect(nextReview(0.9, first).intervalDays).toBe(4);
  });

  it('3回目以降は ease 倍で伸びる', () => {
    const third = nextReview(0.9, { intervalDays: 4, ease: 2.5, repetition: 2 });
    expect(third.intervalDays).toBe(10);
  });

  it('説明できていないと翌日に戻り、連続回数もリセットされる', () => {
    const reset = nextReview(0.2, { intervalDays: 30, ease: 2.5, repetition: 5 });
    expect(reset).toMatchObject({ intervalDays: 1, repetition: 0 });
    expect(reset.ease).toBeLessThan(2.5);
  });

  it('ease は 1.3 を下回らない', () => {
    let state = { intervalDays: 1, ease: 1.3, repetition: 0 };
    for (let i = 0; i < 10; i += 1) state = nextReview(0.1, state);
    expect(state.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('間隔は90日で頭打ちにする', () => {
    expect(nextReview(1, { intervalDays: 80, ease: 2.5, repetition: 9 }).intervalDays).toBe(90);
  });
});
