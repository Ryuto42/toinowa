import 'server-only';
import { z } from 'zod';
import { clientEnv } from './env.client';

/** 32バイト以上の base64 シークレット（openssl rand -base64 32） */
const secret32 = z
  .string()
  .min(32, '32文字以上必要です（openssl rand -base64 32 で生成してください）');

/** フェーズ2で設定する値。未設定なら空文字として扱う */
const optional = z.string().default('');

const schema = z.object({
  // --- AIモデル階層 -------------------------------------------------------
  // dev        … 最安モデル。通常の開発・テストはこれ
  // production … 高性能モデル。「本番環境でテストする」と明示したときだけ
  AI_MODEL_TIER: z.enum(['dev', 'production']).default('dev'),
  // 1日あたりのAI費用上限(USD)。暴走ループでクレジットが溶けるのを防ぐ安全弁。
  AI_ECONOMY_MODEL: z.string().min(1).default('google/gemini-2.5-flash-lite'),
  AI_STANDARD_MODEL: z.string().min(1).default('google/gemini-2.5-flash'),
  AI_ADVANCED_MODEL: z.string().min(1).default('orcarouter/toinowa-advanced'),
  // 音声入力の段。1段目から順に試し、落ちたら次へ降りる。
  AI_AUDIO_MODEL: z.string().min(1).default('google/gemini-2.5-flash'),
  AI_AUDIO_STANDARD_MODEL: z.string().min(1).default('google/gemini-flash-latest'),
  AI_AUDIO_ADVANCED_MODEL: z.string().min(1).default('google/gemini-2.5-flash-lite'),
  AI_VISION_MODEL: z.string().min(1).default('google/gemini-2.5-flash'),
  AI_EXAM_MODEL: z.string().min(1).default('google/gemini-2.5-flash'),
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(1.0),
  // 生徒1人あたりの1日上限。1人の連投で学校全体の枠を使い切らせない。
  AI_STUDENT_DAILY_BUDGET_USD: z.coerce.number().positive().default(0.2),
  ORCAROUTER_API_KEY: z.string().startsWith('sk-orca-'),
  ORCAROUTER_BASE_URL: z.url().default('https://api.orcarouter.ai/v1'),

  // --- Supabase -----------------------------------------------------------
  // この値を読んでよいのは src/lib/database/admin.ts だけ（CIで検査する）
  SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_'),

  // --- アプリ -------------------------------------------------------------
  APP_BASE_URL: z.url(),
  /** pg_net -> /api/internal/worker/tick の共有シークレット */
  WORKER_SECRET: secret32,
  /** 生徒の内部メール合成に使うドメイン。変更にはユーザー移行が必要 */
  AUTH_EMAIL_DOMAIN: z.string().min(1).default('toinowa.local'),

  // --- Web Push -----------------------------------------------------------
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `サーバー環境変数が不正です:\n${z.prettifyError(parsed.error)}\n` +
      '.env.local を確認してください（.env.example が雛形です）。',
  );
}

export const serverEnv = parsed.data;

/** 現在のモデル階層。devで動いているのか本番モデルなのかは運用画面に常時表示する */
export const MODEL_TIER = serverEnv.AI_MODEL_TIER;

/** Web Push が有効かどうか */
export const isWebPushConfigured =
  serverEnv.VAPID_PUBLIC_KEY !== '' && serverEnv.VAPID_PRIVATE_KEY !== '';

/** 生徒の「学校コード + 生徒ID」を Supabase Auth 用の内部メールへ解決する。
 *  users.login_identifier には学校コードと生徒IDだけを保存し、
 *  ドメインは解決時にだけ付ける（ドメイン変更でログイン不能にしないため）。 */
export function resolveStudentEmail(
  schoolCode: string,
  studentId: string,
): string {
  return `${studentId.toLowerCase()}@${schoolCode.toLowerCase()}.${serverEnv.AUTH_EMAIL_DOMAIN}`;
}

export { clientEnv };
