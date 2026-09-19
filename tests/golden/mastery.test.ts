import { describe, expect, it } from 'vitest';
import { computeMastery } from '@/lib/mastery/compute';
import { BASE_WEIGHTS, type MasteryInput } from '@/lib/mastery/types';

/** 成分を指定しない場合は null（欠測）になる入力を組み立てる */
function input(partial: Partial<MasteryInput> = {}): MasteryInput {
  return {
    conceptId: 'c1',
    recent: null,
    history: null,
    transfer: null,
    delayed: null,
    selfCalib: null,
    currentDifficulty: 2,
    ...partial,
  };
}

const perfectRecent = { score: 1, reasoningQuality: 1, hintsUsed: 0 };

describe('computeMastery: 欠測時の再正規化', () => {
  it('recent が無ければ採点しない（古いデータだけで点を付けない）', () => {
    const r = computeMastery(input({ history: { scores: [1, 1, 1] } }));
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.needsReview).toBe(true);
  });

  it('recent だけなら適用重みは 1.0 になる', () => {
    const r = computeMastery(input({ recent: perfectRecent }));
    expect(r.components).toHaveLength(1);
    expect(r.components[0].applied).toBeCloseTo(1, 10);
    expect(r.score).toBeCloseTo(1, 10);
  });

  it('recent + history なら .35/.55 と .20/.55 に再正規化される', () => {
    const r = computeMastery(
      input({ recent: perfectRecent, history: { scores: [1] } }),
    );
    const byKey = Object.fromEntries(r.components.map((c) => [c.key, c]));
    expect(byKey.recent.applied).toBeCloseTo(0.35 / 0.55, 10);
    expect(byKey.history.applied).toBeCloseTo(0.2 / 0.55, 10);
    expect(
      r.components.reduce((a, c) => a + c.applied, 0),
    ).toBeCloseTo(1, 10);
  });

  it('全成分が揃えば適用重み = 基本重み', () => {
    const r = computeMastery(
      input({
        recent: perfectRecent,
        history: { scores: [1, 1] },
        transfer: { scores: [1] },
        delayed: { score: 1, daysSinceLearned: 14 },
        selfCalib: { selfRating: 5, actualScore: 1 },
      }),
    );
    for (const c of r.components) {
      expect(c.applied).toBeCloseTo(BASE_WEIGHTS[c.key], 10);
    }
  });

  it('recent を含む全16通りの成分組み合わせで適用重みの和が 1 になる', () => {
    const optional = ['history', 'transfer', 'delayed', 'selfCalib'] as const;
    for (let mask = 0; mask < 16; mask++) {
      const p: Partial<MasteryInput> = { recent: perfectRecent };
      optional.forEach((key, i) => {
        if (!(mask & (1 << i))) return;
        if (key === 'history') p.history = { scores: [0.8] };
        if (key === 'transfer') p.transfer = { scores: [0.8] };
        if (key === 'delayed') p.delayed = { score: 0.8, daysSinceLearned: 7 };
        if (key === 'selfCalib') p.selfCalib = { selfRating: 4, actualScore: 0.8 };
      });
      const r = computeMastery(input(p));
      expect(r.score).not.toBeNull();
      expect(r.components.reduce((a, c) => a + c.applied, 0)).toBeCloseTo(1, 10);
    }
  });
});

describe('computeMastery: スコア', () => {
  it('ヒントを使うほど直近成分が減点される（ただし0にはしない）', () => {
    const none = computeMastery(input({ recent: { score: 1, reasoningQuality: 1, hintsUsed: 0 } }));
    const all = computeMastery(input({ recent: { score: 1, reasoningQuality: 1, hintsUsed: 3 } }));
    expect(all.score!).toBeLessThan(none.score!);
    expect(all.score!).toBeCloseTo(0.7, 10);
  });

  it('解答過程が伴わない正答は満点にならない', () => {
    const r = computeMastery(
      input({ recent: { score: 1, reasoningQuality: 0, hintsUsed: 0 } }),
    );
    expect(r.score!).toBeCloseTo(0.7, 10);
  });

  it('自己評価が実力とずれているほど較正成分が下がる', () => {
    const aligned = computeMastery(
      input({ recent: perfectRecent, selfCalib: { selfRating: 5, actualScore: 1 } }),
    );
    const overconfident = computeMastery(
      input({ recent: perfectRecent, selfCalib: { selfRating: 5, actualScore: 0 } }),
    );
    const a = aligned.components.find((c) => c.key === 'selfCalib')!;
    const o = overconfident.components.find((c) => c.key === 'selfCalib')!;
    expect(a.raw).toBeCloseTo(1, 10);
    expect(o.raw).toBeCloseTo(0, 10);
  });

  it('過小評価も過大評価と同じだけ較正できていないと扱う', () => {
    const under = computeMastery(
      input({ recent: perfectRecent, selfCalib: { selfRating: 1, actualScore: 1 } }),
    );
    expect(under.components.find((c) => c.key === 'selfCalib')!.raw).toBeCloseTo(0, 10);
  });

  it('過去結果は新しいものほど重い', () => {
    const improving = computeMastery(
      input({ recent: perfectRecent, history: { scores: [1, 0, 0] } }),
    );
    const declining = computeMastery(
      input({ recent: perfectRecent, history: { scores: [0, 1, 1] } }),
    );
    expect(improving.score!).toBeGreaterThan(declining.score!);
  });
});

describe('computeMastery: 確信度とHITLゲート', () => {
  it('証拠が直近1件だけなら確信度は低く、先生レビューへ回る', () => {
    const r = computeMastery(input({ recent: perfectRecent }));
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.needsReview).toBe(true);
  });

  it('成分が揃い観測数が多く一貫していれば確信度が上がる', () => {
    const r = computeMastery(
      input({
        recent: { score: 0.9, reasoningQuality: 0.9, hintsUsed: 0 },
        history: { scores: [0.9, 0.9, 0.9] },
        transfer: { scores: [0.9, 0.9] },
        delayed: { score: 0.9, daysSinceLearned: 10 },
        selfCalib: { selfRating: 5, actualScore: 0.9 },
      }),
    );
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    expect(r.needsReview).toBe(false);
  });

  it('成分どうしが矛盾していると確信度が下がる', () => {
    const consistent = computeMastery(
      input({
        recent: { score: 0.9, reasoningQuality: 0.9, hintsUsed: 0 },
        history: { scores: [0.9, 0.9, 0.9] },
        transfer: { scores: [0.9, 0.9] },
        delayed: { score: 0.9, daysSinceLearned: 10 },
      }),
    );
    const contradictory = computeMastery(
      input({
        recent: { score: 1, reasoningQuality: 1, hintsUsed: 0 },
        history: { scores: [0, 0, 0] },
        transfer: { scores: [1, 1] },
        delayed: { score: 0, daysSinceLearned: 10 },
      }),
    );
    expect(contradictory.confidence).toBeLessThan(consistent.confidence);
  });

  it('スコアは常に 0..1 に収まる', () => {
    const r = computeMastery(
      input({
        recent: { score: 5, reasoningQuality: 5, hintsUsed: -3 },
        delayed: { score: 1, daysSinceLearned: 9999 },
      }),
    );
    expect(r.score!).toBeLessThanOrEqual(1);
    expect(r.score!).toBeGreaterThanOrEqual(0);
  });
});
