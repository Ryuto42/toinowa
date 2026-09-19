import 'server-only';
import OpenAI from 'openai';
import { serverEnv } from '@/lib/shared/env.server';

/**
 * OrcaRouter は OpenAI 互換なので OpenAI SDK をそのまま使う。
 *
 * `maxRetries: 0` が重要。SDK に再試行させると、こちらの梯子（§call.ts）と
 * 二重になって遅延が膨らむ上、fallback_count が実態と食い違う。
 * 再試行は自前で持つ。
 *
 * `X-OrcaRouter-Include-Cost` を既定ヘッダに入れておくと、
 * レスポンスの `usage.cost_usd` に実測費用が載る（有料モデルのみ）。
 */
export const orca = new OpenAI({
  apiKey: serverEnv.ORCAROUTER_API_KEY,
  baseURL: serverEnv.ORCAROUTER_BASE_URL,
  defaultHeaders: { 'X-OrcaRouter-Include-Cost': 'true' },
  maxRetries: 0,
  timeout: 60_000,
});
