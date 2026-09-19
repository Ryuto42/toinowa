import { z } from 'zod';

/**
 * クライアントにも渡ってよい環境変数。
 *
 * Next.js は `process.env.NEXT_PUBLIC_X` という「リテラル表記」だけをビルド時に
 * 値へ差し替える。変数経由の動的アクセスは undefined になるため、
 * 必ずここで一度リテラルとして読み出すこと。
 */
const raw = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_SHORT_NAME: process.env.NEXT_PUBLIC_APP_SHORT_NAME,
  NEXT_PUBLIC_APP_TAGLINE: process.env.NEXT_PUBLIC_APP_TAGLINE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_LINE_ADD_FRIEND_URL: process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL,
};

const boolish = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('StudyPilot AI'),
  NEXT_PUBLIC_APP_SHORT_NAME: z.string().min(1).default('StudyPilot'),
  NEXT_PUBLIC_APP_TAGLINE: z.string().default(''),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_DEMO_MODE: boolish,
  NEXT_PUBLIC_LINE_ADD_FRIEND_URL: z.union([z.url(), z.literal('')]).default(''),
});

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  throw new Error(
    `公開環境変数が不正です:\n${z.prettifyError(parsed.error)}\n` +
      '.env.local を確認してください（.env.example が雛形です）。',
  );
}

export const clientEnv = parsed.data;
