import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/shared/env.client';
import type { Database } from './types';

/**
 * リクエストスコープの Supabase クライアント。**RLS が効く**。
 *
 * 通常のページ・APIルートからのDBアクセスはすべてこれを使う。
 * 利用者のJWTで動くので、ポリシーに反する行はそもそも返ってこない。
 *
 * ⚠️ Next.js 16 では `cookies()` が非同期。await を忘れると型エラーになる。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component から呼ばれた場合は Cookie を書けない。
            // セッション更新は proxy.ts が担うので、ここは握りつぶしてよい。
          }
        },
      },
    },
  );
}
