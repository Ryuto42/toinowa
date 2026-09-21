import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/lib/shared/env.client';
import { serverEnv } from '@/lib/shared/env.server';
import type { Database } from './types';

/**
 * ⚠️⚠️ service role クライアント。**RLS を完全にバイパスする**。 ⚠️⚠️
 *
 * このファイルを import してよいのは次の2箇所だけ:
 *   1. src/lib/jobs/worker.ts       … ジョブ実行（利用者のセッションが無い）
 *   2. src/lib/security/audit.ts    … 監査ログは利用者の権限に関係なく必ず書く
 *
 * ESLint の import 制限と CI の grep 検査で、これ以外からの参照を落としている。
 *
 * ここを使うコードは **RLS の保護が無い** ことを常に意識すること。
 * テナント境界は自分で `.eq('tenant_id', tenantId)` と書いて守る必要がある。
 * そのため、リポジトリ層の関数は tenantId を必須の第1引数に取る規約にしている。
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** 使い回し用のシングルトン。ステートレスなので共有して問題ない。 */
let cached: ReturnType<typeof createAdminClient> | null = null;

export function adminDb() {
  cached ??= createAdminClient();
  return cached;
}
