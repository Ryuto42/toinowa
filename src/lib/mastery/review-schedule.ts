/**
 * 間隔反復（SM-2の簡約版）で次の復習日を決める。
 *
 * 純関数にしてあるのは、先生に「なぜこの日なのか」を説明できるようにするため。
 * 点数が高いほど間隔が伸び、低いと翌日に戻る。
 */
export interface ReviewState {
  intervalDays: number;
  ease: number;
  repetition: number;
}

export function nextReview(score: number, previous: ReviewState | null): ReviewState {
  const base: ReviewState = previous ?? { intervalDays: 0, ease: 2.5, repetition: 0 };
  // 0..1 のスコアを SM-2 の 0..5 へ写す
  const quality = Math.round(score * 5);
  if (quality < 3) {
    // 説明できていない。翌日もう一度。間隔も連続回数もリセットする。
    return { intervalDays: 1, ease: Math.max(1.3, base.ease - 0.2), repetition: 0 };
  }
  const ease = Math.max(1.3, base.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const repetition = base.repetition + 1;
  const intervalDays = repetition === 1 ? 1
    : repetition === 2 ? 4
    : Math.min(90, Math.round(base.intervalDays * ease));
  return { intervalDays, ease: Number(ease.toFixed(2)), repetition };
}
