/**
 * 回答にかかった時間から、学習の手応えを推定する。
 *
 * I/O もLLMも使わない純関数。理解度スコアに掛ける係数を返す。
 *
 * 考え方: 速すぎても遅すぎても「自分で考えて書いた説明」から遠ざかる。
 *   速すぎる → 貼り付け、あるいは考えずに書いている
 *   遅すぎる → 詰まっている、または離席している
 * ただし**減点は控えめにする**。時間は状況に左右されやすく、
 * 単独で結論を出せる証拠ではないため、最大でも15%しか動かさない。
 */

/** 生徒が日本語を打つ速度の目安（文字/秒）。これで「妥当な所要時間」を見積もる。 */
const CHARS_PER_SECOND = 1.2;
/** これより短い回答は時間で判断しない（「はい」等の相づちを速いと責めない） */
const MIN_CHARS_FOR_PACE = 30;
/** 離席とみなす上限 */
const ABSENT_SECONDS = 15 * 60;

export type PaceVerdict = 'too_fast' | 'expected' | 'too_slow' | 'unknown';

export interface PaceResult {
  verdict: PaceVerdict;
  /** 理解度の直近成分に掛ける係数 0.85..1.0 */
  factor: number;
  /** 想定所要時間に対する実測の比 */
  ratio: number | null;
  /** 生徒と先生に見せる日本語の説明 */
  reason: string;
}

export function evaluatePace(chars: number, elapsedSec: number | null): PaceResult {
  if (elapsedSec === null || elapsedSec <= 0 || chars < MIN_CHARS_FOR_PACE) {
    return { verdict: 'unknown', factor: 1, ratio: null, reason: '' };
  }
  const expected = chars / CHARS_PER_SECOND;
  const ratio = elapsedSec / expected;

  if (ratio < 0.3) {
    return {
      verdict: 'too_fast',
      factor: 0.85,
      ratio,
      reason: `${chars}文字の説明を${Math.round(elapsedSec)}秒で送信しています。自分で組み立てた説明か確認が必要です。`,
    };
  }
  if (elapsedSec > ABSENT_SECONDS || ratio > 4) {
    return {
      verdict: 'too_slow',
      factor: 0.9,
      ratio,
      reason: `1つの説明に${Math.round(elapsedSec / 60)}分かかっています。どこで詰まったか確認するとよさそうです。`,
    };
  }
  return { verdict: 'expected', factor: 1, ratio, reason: '' };
}

/** 会話全体の複数回答をまとめて1つの係数にする（最も低いものを採る） */
export function combinePace(results: PaceResult[]): PaceResult {
  const scored = results.filter((item) => item.verdict !== 'unknown');
  if (!scored.length) return { verdict: 'unknown', factor: 1, ratio: null, reason: '' };
  return scored.reduce((worst, item) => (item.factor < worst.factor ? item : worst));
}
