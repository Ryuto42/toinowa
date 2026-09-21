import 'server-only';
import { MODEL_TIER } from '@/lib/shared/env.server';

/**
 * 用途別のルーターキー。設計書15.2の Named Router 案に対応する。
 */
export type RouterKey = 'studentChat' | 'assessment' | 'curriculum' | 'safety';

export type ModelTier = 'dev' | 'production';

/**
 * rung0 で叩くモデル / ルーター。
 *
 * production 階層は OrcaRouter ダッシュボードの Routing で作成した Named Router を指す。
 * dev 階層は Named Router を作らず、実測で選んだ具体モデルを直接指定する
 * （ダッシュボード設定に依存せず、誰の環境でもそのまま動くようにするため）。
 */
export const PRIMARY: Record<ModelTier, Record<RouterKey, string>> = {
  dev: {
    studentChat: 'google/gemini-2.5-flash-lite',
    assessment: 'google/gemini-2.5-flash-lite',
    curriculum: 'google/gemini-2.5-flash-lite',
    safety: 'google/gemini-2.5-flash-lite',
  },
  production: {
    studentChat: 'orcarouter/student-chat',
    assessment: 'orcarouter/assessment',
    curriculum: 'orcarouter/curriculum',
    safety: 'orcarouter/safety-review',
  },
};

/**
 * rung2 の明示フォールバック連鎖（`extra_body.route = "fallback"` / 最大5件）。
 *
 * 意図的に **プロバイダーを分散** させている。同一プロバイダー内で並べても、
 * そのプロバイダーが落ちたときに連鎖ごと倒れるため、フェイルオーバーにならない。
 */
export const FALLBACK_CHAIN: Record<ModelTier, Record<RouterKey, string[]>> = {
  dev: {
    // Google -> OpenAI -> DeepSeek
    // z-ai/glm-5.3-flash は P50 40.4 秒かつ json_schema を無視するため外した。
    // 退避先が本来の障害より遅く、スキーマ検証でも落ちるので縮退にならない。
    studentChat: ['google/gemini-2.5-flash-lite', 'openai/gpt-oss-120b', 'deepseek/deepseek-v4.1-flash'],
    assessment: ['google/gemini-2.5-flash-lite', 'openai/gpt-oss-120b', 'deepseek/deepseek-v4.1-flash'],
    curriculum: ['google/gemini-2.5-flash-lite', 'openai/gpt-oss-120b', 'deepseek/deepseek-v4.1-flash'],
    safety: ['google/gemini-2.5-flash-lite', 'openai/gpt-oss-120b'],
  },
  production: {
    studentChat: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'deepseek/deepseek-v4.1-flash'],
    assessment: ['openai/gpt-4o', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
    curriculum: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
    safety: ['google/gemini-2.5-flash-lite', 'openai/gpt-oss-120b'],
  },
};

/**
 * 埋め込み。chat 系とは別勘定で、Named Router の概念は適用されない。
 *
 * ⚠️ EMBEDDING_DIMS は supabase/migrations/0004_content.sql の
 *    `embedding vector(1536)` と必ず一致させること。
 *    変更する場合は ALTER TYPE + インデックス再構築 + 全件再埋め込みが要る。
 */
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

export const TIER: ModelTier = MODEL_TIER;

export function primaryModel(router: RouterKey): string {
  return PRIMARY[TIER][router];
}

export function fallbackModels(router: RouterKey): string[] {
  // extra_body.models は最大5件。超過分は黙って切り捨てられるので明示的に切る。
  return FALLBACK_CHAIN[TIER][router].slice(0, 5);
}
