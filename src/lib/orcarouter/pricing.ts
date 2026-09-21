import 'server-only';
import { orca } from './client';

/**
 * 費用が返らなかった応答を、カタログの単価から見積もる。
 *
 * OrcaRouter は音声を含むリクエストに `usage.cost_usd` を返さない（実測で確認）。
 * そのまま 0 として扱うと、使った額が表示に出ないだけでなく、
 * 日次予算のガードが音声の消費をまったく数えなくなる。
 *
 * 単価はカタログ（/v1/models）から取る。表に焼き込むと、値上げに気づけない。
 */

interface Price { inputPerM: number; outputPerM: number }

let cache: { at: number; prices: Map<string, Price> } | null = null;
const TTL_MS = 6 * 3_600_000;
/** 取得に失敗したあと、毎回取りに行って遅くしないための間隔 */
const RETRY_MS = 5 * 60_000;
let failedAt = 0;

/**
 * 音声トークンの割増。
 *
 * カタログは入力の単価を1つしか持たないが、実際の音声入力は文字より高い
 * （Gemini 2.5 Flash は文字 $0.30/M に対し音声 $1.00/M）。
 * 予算のガードに使う値なので、低く出るより高く出るほうが安全な側に倒れる。
 */
const AUDIO_INPUT_MULTIPLIER = 3.5;

/** resolved_model はベンダー接頭辞が無く、日付版のこともある。 */
function lookup(prices: Map<string, Price>, model: string): Price | null {
  const direct = prices.get(model);
  if (direct) return direct;
  for (const [id, price] of prices) {
    const bare = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
    if (bare === model || model.startsWith(`${bare}-`)) return price;
  }
  return null;
}

async function catalog(): Promise<Map<string, Price> | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.prices;
  if (now - failedAt < RETRY_MS) return cache?.prices ?? null;
  try {
    const listed = await orca.models.list();
    const prices = new Map<string, Price>();
    for (const model of listed.data) {
      const pricing = (model as { pricing?: { prompt_per_million?: unknown; completion_per_million?: unknown } }).pricing;
      const inputPerM = Number(pricing?.prompt_per_million);
      const outputPerM = Number(pricing?.completion_per_million);
      if (Number.isFinite(inputPerM) && Number.isFinite(outputPerM)) {
        prices.set(model.id, { inputPerM, outputPerM });
      }
    }
    if (!prices.size) throw new Error('カタログに単価がありません');
    cache = { at: now, prices };
    return prices;
  } catch (error) {
    failedAt = now;
    console.error('[pricing] モデル単価を取得できませんでした:', error);
    return cache?.prices ?? null;
  }
}

/** 見積もれなければ null。0 を返すと「無料だった」と区別できない。 */
export async function estimateCostUsd(input: {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  audioInputTokens?: number;
}): Promise<number | null> {
  if (!input.model) return null;
  const prices = await catalog();
  if (!prices) return null;
  const price = lookup(prices, input.model);
  if (!price) return null;

  const audio = Math.min(input.audioInputTokens ?? 0, input.inputTokens);
  const text = Math.max(input.inputTokens - audio, 0);
  const cost = (text * price.inputPerM
    + audio * price.inputPerM * AUDIO_INPUT_MULTIPLIER
    + input.outputTokens * price.outputPerM) / 1_000_000;
  return Number.isFinite(cost) ? cost : null;
}
