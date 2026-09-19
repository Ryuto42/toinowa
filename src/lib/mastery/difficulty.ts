import type { DifficultyLevel } from './types';

/**
 * 難易度調整（設計書12.3）。
 *
 * すべての判定は `reason` を日本語で返す。
 * 先生は必ず「なぜ上げた / 下げたのか」を訊くので、
 * 「モデルが決めました」は答えにならない。
 */

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  1: '用語と基本事項',
  2: '標準的な適用問題',
  3: '複数概念を組み合わせる問題',
  4: '条件変更と応用問題',
  5: '初見状況への転移問題',
};

export interface DifficultyInput {
  current: DifficultyLevel;
  /** 現在のレベルでの直近スコア（新しい順）。昇格判定は先頭2件を見る */
  recentScoresAtLevel: number[];
  /** 直近の解答過程の妥当性（新しい順） */
  recentReasoningQuality: number[];
  /** 直近のヒント使用数（新しい順） */
  recentHintsUsed: number[];
  /** 直近3回の評価で検出された誤概念コード（新しい順の配列の配列） */
  recentMisconceptionCodes: string[][];
  /** ヒント提示後の解答過程の妥当性。無ければ null */
  reasoningAfterHints: number | null;
  /** 直近7日の1日あたり平均学習時間(分) */
  avgDailyMinutes7d: number;
  /** 生徒が設定した1日の上限(分) */
  dailyTimeLimitMin: number;
}

export interface DifficultyDecision {
  next: DifficultyLevel;
  direction: 'promote' | 'demote' | 'hold';
  /** 先生と生徒に見せる日本語の理由 */
  reason: string;
}

const clampLevel = (n: number): DifficultyLevel =>
  Math.min(5, Math.max(1, n)) as DifficultyLevel;

const mean = (xs: number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * 昇格・降格を判定する。
 *
 * 重要な制約: **1回の評価で2段階以上動かさない**。
 * 学習者の体感として急な難化・易化は学習意欲を削ぐし、
 * 1回の観測でそこまで断定できるだけの情報も無い。
 */
export function decideDifficulty(input: DifficultyInput): DifficultyDecision {
  const {
    current,
    recentScoresAtLevel,
    recentReasoningQuality,
    recentHintsUsed,
    recentMisconceptionCodes,
    reasoningAfterHints,
    avgDailyMinutes7d,
    dailyTimeLimitMin,
  } = input;

  // ── 降格判定を先に行う。学習負荷と誤概念の継続は昇格条件より優先する ──

  // 同じ誤概念コードが直近3回中2回以上出ている
  const window = recentMisconceptionCodes.slice(0, 3);
  const counts = new Map<string, number>();
  for (const codes of window) {
    for (const code of new Set(codes)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  const persistent = [...counts.entries()].find(([, n]) => n >= 2);
  if (persistent) {
    return {
      next: clampLevel(current - 1),
      direction: 'demote',
      reason:
        `同じつまずき（${persistent[0]}）が直近3回中${persistent[1]}回続いているため、` +
        `${DIFFICULTY_LABELS[clampLevel(current - 1)]}に戻して土台を固めます。`,
    };
  }

  // ヒントを出しても解答過程が安定しない
  if (reasoningAfterHints !== null && reasoningAfterHints < 0.5) {
    return {
      next: clampLevel(current - 1),
      direction: 'demote',
      reason:
        'ヒントを見たあとも考え方が固まりきっていないため、' +
        `${DIFFICULTY_LABELS[clampLevel(current - 1)]}に戻します。`,
    };
  }

  // 学習負荷が本人の設定上限を超えている
  if (dailyTimeLimitMin > 0 && avgDailyMinutes7d > dailyTimeLimitMin) {
    return {
      next: clampLevel(current - 1),
      direction: 'demote',
      reason:
        `直近7日の学習時間が1日あたり${Math.round(avgDailyMinutes7d)}分で、` +
        `設定した${dailyTimeLimitMin}分を超えています。負担を下げるため難易度を1つ戻します。`,
    };
  }

  // ── 昇格判定: 3条件すべてを満たすこと ──
  const lastTwo = recentScoresAtLevel.slice(0, 2);
  const stableCorrect = lastTwo.length >= 2 && lastTwo.every((s) => s >= 0.8);
  const lowHintDependence = mean(recentHintsUsed.slice(0, 2)) <= 1;
  const soundReasoning = mean(recentReasoningQuality.slice(0, 2)) >= 0.7;

  if (stableCorrect && lowHintDependence && soundReasoning) {
    if (current === 5) {
      return {
        next: 5,
        direction: 'hold',
        reason:
          '最上位の「初見状況への転移問題」で安定して正答できています。' +
          'この難易度を維持しつつ、別の単元へ広げます。',
      };
    }
    return {
      next: clampLevel(current + 1),
      direction: 'promote',
      reason:
        `${DIFFICULTY_LABELS[current]}で2回続けて安定して正答し、` +
        'ヒントもほとんど使わず考え方も妥当でした。' +
        `次は${DIFFICULTY_LABELS[clampLevel(current + 1)]}に進みます。`,
    };
  }

  // ── 据え置き。なぜ上げないのかを具体的に言う ──
  const missing: string[] = [];
  if (!stableCorrect) missing.push('同じ難易度で2回続けて正答すること');
  if (!lowHintDependence) missing.push('ヒントに頼らず解けること');
  if (!soundReasoning) missing.push('考え方の筋道が安定すること');

  return {
    next: current,
    direction: 'hold',
    reason:
      `${DIFFICULTY_LABELS[current]}を続けます。` +
      `次に進む条件は「${missing.join('」「')}」です。`,
  };
}
