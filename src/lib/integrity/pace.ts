/**
 * 入力ペースは先生が確認する補助情報。音声・端末・年齢・離席の影響があるため、
 * 学力や本人性の確定、理解度スコアの自動減点には使わない。
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
  /** 想定所要時間に対する実測の比 */
  ratio: number | null;
  /** 生徒と先生に見せる日本語の説明 */
  reason: string;
}

export function evaluatePace(chars: number, elapsedSec: number | null): PaceResult {
  if (elapsedSec === null || elapsedSec <= 0 || chars < MIN_CHARS_FOR_PACE) {
    return { verdict: 'unknown', ratio: null, reason: '' };
  }
  const expected = chars / CHARS_PER_SECOND;
  const ratio = elapsedSec / expected;

  if (ratio < 0.3) {
    return {
      verdict: 'too_fast',
      ratio,
      reason: `${chars}文字の説明を${Math.round(elapsedSec)}秒で送信しています。音声入力や貼り付け等でも短くなります。必要なら入力方法を確認してください。`,
    };
  }
  if (elapsedSec > ABSENT_SECONDS || ratio > 4) {
    return {
      verdict: 'too_slow',
      ratio,
      reason: `1つの説明に${Math.round(elapsedSec / 60)}分かかっています。離席や入力環境の影響もあります。必要なら様子を確認してください。`,
    };
  }
  return { verdict: 'expected', ratio, reason: '' };
}

/** 確認の手がかりを1件選ぶ。スコアへの重み付けはしない。 */
export function combinePace(results: PaceResult[]): PaceResult {
  const scored = results.filter((item) => item.verdict !== 'unknown');
  if (!scored.length) return { verdict: 'unknown', ratio: null, reason: '' };
  return scored.find(item => item.verdict === 'too_fast') ?? scored.find(item => item.verdict === 'too_slow') ?? scored[0];
}
