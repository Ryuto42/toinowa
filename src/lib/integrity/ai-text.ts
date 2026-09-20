/**
 * 生徒の説明がAIで生成されたものかを推定する。
 *
 * 前半（この関数）はコストゼロの決定的な指標だけで採点する。
 * 灰色のものだけ後段のLLM判定へ回す（src/lib/integrity/ai-judge.ts）。
 *
 * ⚠️ この判定は**証拠ではなく手がかり**として扱うこと。
 *    丁寧に書ける生徒を疑ってしまう誤検知は必ず起きる。
 *    そのため生徒には一切表示せず、先生への介入としてだけ上げる。
 */

export interface TypingSignals {
  /** クライアントが計測した「打鍵していた時間」(ms) */
  typingMs?: number | null;
  /** 貼り付け回数 */
  pasteCount?: number | null;
  /** 打鍵数 */
  keystrokes?: number | null;
  /** 問いが表示されてから送信するまで(秒) */
  elapsedSec?: number | null;
}

export interface HeuristicSignal {
  key: string;
  /** 0..1。高いほどAIらしい */
  score: number;
  /** 重み */
  weight: number;
  /** 先生に見せる根拠 */
  note: string;
}

export interface HeuristicResult {
  /** 0..1 */
  score: number;
  signals: HeuristicSignal[];
  /** LLM判定に回すべきか */
  needsJudge: boolean;
}

/** これ未満は白。これ以上 UPPER 未満が灰色でLLMに回す。UPPER 以上は黒。 */
const GREY_LOWER = 0.35;
const GREY_UPPER = 0.75;

/** 論述的な接続表現。AIの文章は密度が高くなりやすい */
const FORMAL_CONNECTIVES = /(また|さらに|一方で|したがって|このように|つまり|加えて|すなわち|具体的には|以上のように|重要です|考えられます|といえます)/gu;
/** 生徒の書き言葉に出る、ためらい・口語のしるし */
const COLLOQUIAL_MARKERS = /(と思う|たぶん|多分|かな|かも|よく分から|わからな|えっと|あと|なんか|気がする|だと思います|はず)/gu;
/** 箇条書き・番号付けの構造 */
const ENUMERATION = /(^|\n)\s*(・|[-*]|[0-9１-９]+[.．、)]|第[一二三四五六七八九十]|[0-9１-９]+つ目)/gu;

function sentences(text: string): string[] {
  return text.split(/[。．\n]+/u).map((s) => s.trim()).filter((s) => s.length > 0);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** 0..1 に収める。x が lo のとき0、hi のとき1。 */
function ramp(x: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
}

export function detectAiText(text: string, signals: TypingSignals = {}): HeuristicResult {
  const chars = text.length;
  const out: HeuristicSignal[] = [];

  // ── 貼り付け: 最も強い手がかり ──
  const pastes = signals.pasteCount ?? 0;
  if (pastes > 0) {
    out.push({
      key: 'paste',
      score: chars >= 80 ? 1 : 0.6,
      weight: 3,
      note: `送信までに${pastes}回の貼り付けがありました。`,
    });
  }

  // ── 打鍵数と文字数の乖離: 打たずに文字が増えている ──
  if (typeof signals.keystrokes === 'number' && chars >= 40) {
    const perChar = signals.keystrokes / chars;
    if (perChar < 0.4) {
      out.push({
        key: 'keystroke_gap',
        score: ramp(0.4 - perChar, 0, 0.35),
        weight: 3,
        note: `${chars}文字に対して打鍵が${signals.keystrokes}回しかありません。`,
      });
    }
  }

  // ── 打鍵速度: 人が打てる速さを超えている ──
  if (signals.typingMs && signals.typingMs > 0 && chars >= 40) {
    const cps = chars / (signals.typingMs / 1000);
    if (cps > 6) {
      out.push({
        key: 'typing_speed',
        score: ramp(cps, 6, 15),
        weight: 2,
        note: `入力速度が毎秒${cps.toFixed(1)}文字です。`,
      });
    }
  }

  // 以下は文章そのものの特徴。単独では弱いので重みを小さくする。
  if (chars >= 60) {
    // ── 文の長さが揃いすぎている ──
    const lens = sentences(text).map((s) => s.length);
    if (lens.length >= 3) {
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const cv = mean > 0 ? stddev(lens) / mean : 0;
      if (cv < 0.35) {
        out.push({
          key: 'uniform_sentences',
          score: ramp(0.35 - cv, 0, 0.3),
          weight: 1,
          note: `文の長さのばらつきが小さく、整いすぎています（変動係数 ${cv.toFixed(2)}）。`,
        });
      }
    }

    // ── 論述的な接続表現が多い ──
    const per100 = (count(text, FORMAL_CONNECTIVES) / chars) * 100;
    if (per100 > 1.2) {
      out.push({
        key: 'formal_connectives',
        score: ramp(per100, 1.2, 4),
        weight: 1.5,
        note: `「また」「このように」などの接続表現が100文字あたり${per100.toFixed(1)}回出ています。`,
      });
    }

    // ── 口語・ためらいが皆無 ──
    if (count(text, COLLOQUIAL_MARKERS) === 0 && chars >= 120) {
      out.push({
        key: 'no_hedging',
        score: 0.6,
        weight: 1.5,
        note: '「〜と思う」のような自分の言葉らしい表現が見当たりません。',
      });
    }

    // ── 箇条書き構造 ──
    if (count(text, ENUMERATION) >= 2) {
      out.push({
        key: 'enumeration',
        score: 0.5,
        weight: 1,
        note: 'チャットの返答としては整った箇条書き構造になっています。',
      });
    }
  }

  // ── 所要時間に対して文章が長すぎる ──
  if (signals.elapsedSec && signals.elapsedSec > 0 && chars >= 80) {
    const cps = chars / signals.elapsedSec;
    if (cps > 4) {
      out.push({
        key: 'too_fast_for_length',
        score: ramp(cps, 4, 12),
        weight: 2.5,
        note: `${chars}文字を${Math.round(signals.elapsedSec)}秒で送信しています。`,
      });
    }
  }

  const totalWeight = out.reduce((a, s) => a + s.weight, 0);
  const score = totalWeight
    ? Math.min(1, out.reduce((a, s) => a + s.score * s.weight, 0) / totalWeight)
    : 0;

  return {
    score,
    signals: out,
    needsJudge: score >= GREY_LOWER && score < GREY_UPPER,
  };
}

export type AiVerdict = 'low' | 'medium' | 'high';

export function verdictOf(score: number): AiVerdict {
  if (score >= GREY_UPPER) return 'high';
  if (score >= GREY_LOWER) return 'medium';
  return 'low';
}

export { GREY_LOWER, GREY_UPPER };
