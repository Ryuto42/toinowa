'use client';

import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/shared/env.client';
import type { Database } from './types';

/**
 * ブラウザ側の Supabase クライアント。publishable key を使うので RLS が効く。
 *
 * データ取得の主役は Server Component なので、これを使うのは
 * ログインフォームと Realtime の購読くらいに留める。
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
