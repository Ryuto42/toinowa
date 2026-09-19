import {
  BASE_WEIGHTS,
  LOW_CONFIDENCE_THRESHOLD,
  type ComponentKey,
  type ComponentResult,
  type MasteryInput,
  type MasteryResult,
} from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * ヒント依存度の減点。
 * ヒントを使っても正答できたこと自体は価値があるので、ゼロにはしない。
 * 3段すべて使った場合でも 0.7 倍にとどめる。
 */
function hintPenalty(hintsUsed: number): number {
  return 1 - 0.1 * Math.min(3, Math.max(0, hintsUsed));
}

/** 直近: 正答 7 : 解答過程 3。過程を見るのがこのプロダクトの主張の中心。 */
function recentScore(s: { score: number; reasoningQuality: number; hintsUsed: number }) {
  return clamp01((s.score * 0.7 + s.reasoningQuality * 0.3) * hintPenalty(s.hintsUsed));
}

/**
 * 過去結果: 新しいものほど重い指数減衰（比 0.5）。
 * 単純平均だと、古い低スコアがいつまでも足を引っ張る。
 */
function historyScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  let num = 0;
  let den = 0;
  scores.forEach((v, i) => {
    // scores は新しい順。半減期を1件に近づけ、直近の変化を確実に反映する。
    const w = Math.pow(0.5, i);
    num += clamp01(v) * w;
    den += w;
  });
  return num / den;
}

/** 転移: 単純平均。件数が少ないことは confidence 側で扱う。 */
function transferScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return clamp01(scores.reduce((a, b) => a + clamp01(b), 0) / scores.length);
}

/**
 * 遅延再テスト: 期間が長いほど「定着している」証拠として加点する。
 * 14日で最大 1.15 倍。ただし 1.0 は超えない。
 */
function delayedScore(s: { score: number; daysSinceLearned: number }): number {
  const bonus = 1 + 0.15 * Math.min(1, Math.max(0, s.daysSinceLearned) / 14);
  return clamp01(clamp01(s.score) * bonus);
}

/**
 * 自己評価の較正: 自己申告と実力の「ズレの小ささ」を測る。
 * 高く見積もりすぎ（分かったつもり）も、低く見積もりすぎ（自信の欠如）も
 * 等しく較正できていないものとして扱う。
 * これは「実力」ではなくメタ認知の指標なので重みが最も軽い（.10）。
 */
function selfCalibScore(s: { selfRating: number; actualScore: number }): number {
  const selfNorm = (Math.min(5, Math.max(1, s.selfRating)) - 1) / 4;
  return clamp01(1 - Math.abs(selfNorm - clamp01(s.actualScore)));
}

/** 標準偏差。consistency の算出に使う。 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * 理解度スコアと確信度を算出する。
 *
 * 欠測がある場合は、存在する成分の基本重みの和で割って再正規化する。
 * 例: recent と history だけなら .35/.55 = .636, .20/.55 = .364。
 *
 * ただし **recent が無い場合は採点しない**（score: null, confidence: 0）。
 * 直近の観測なしに「今この生徒が何をできるか」は言えない。
 */
export function computeMastery(input: MasteryInput): MasteryResult {
  const raws: Partial<Record<ComponentKey, number>> = {};
  let observationCount = 0;

  if (input.recent) {
    raws.recent = recentScore(input.recent);
    observationCount += 1;
  }
  if (input.history && input.history.scores.length > 0) {
    raws.history = historyScore(input.history.scores);
    observationCount += input.history.scores.length;
  }
  if (input.transfer && input.transfer.scores.length > 0) {
    raws.transfer = transferScore(input.transfer.scores);
    observationCount += input.transfer.scores.length;
  }
  if (input.delayed) {
    raws.delayed = delayedScore(input.delayed);
    observationCount += 1;
  }
  if (input.selfCalib) {
    raws.selfCalib = selfCalibScore(input.selfCalib);
    // 自己申告は「観測」として数えない。メタ認知の指標であって実力の証拠ではない。
  }

  const presentKeys = Object.keys(raws) as ComponentKey[];
  const coverage = presentKeys.reduce((a, k) => a + BASE_WEIGHTS[k], 0);

  // recent が無ければ採点しない
  if (!input.recent || presentKeys.length === 0) {
    return {
      score: null,
      confidence: 0,
      components: presentKeys.map((k) => ({
        key: k,
        raw: raws[k]!,
        weight: BASE_WEIGHTS[k],
        applied: 0,
      })),
      observationCount,
      needsReview: true,
    };
  }

  const components: ComponentResult[] = presentKeys.map((k) => ({
    key: k,
    raw: raws[k]!,
    weight: BASE_WEIGHTS[k],
    applied: BASE_WEIGHTS[k] / coverage,
  }));

  const score = clamp01(
    components.reduce((a, c) => a + c.raw * c.applied, 0),
  );

  // 確信度は点数と別物。
  //   coverage    … どれだけの重みぶんの証拠が揃っているか
  //   volume      … 観測数。5件で頭打ち
  //   consistency … 成分間のばらつきの小ささ。矛盾する証拠は確信度を下げる
  const volume = Math.min(1, observationCount / 5);
  const consistency = clamp01(1 - stddev(components.map((c) => c.raw)));
  const confidence = clamp01(coverage * volume * consistency);

  return {
    score,
    confidence,
    components,
    observationCount,
    needsReview: confidence < LOW_CONFIDENCE_THRESHOLD,
  };
}
