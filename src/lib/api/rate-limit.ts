import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { TooManyRequests } from './http';

/**
 * AIを呼ぶ操作の回数制限。
 *
 * 予算のガードは「いくら使ったか」で止めるが、上限に届くまでの短時間に
 * 大量の呼び出しを浴びせることは止められない。回数そのものにも蓋をする。
 *
 * 数え方は agent_runs の実績。専用の表を持たないので、
 * 同時に飛んできた分は記録が間に合わず数個すり抜ける。
 * 厳密な制限ではなく、暴走と連打を止めるためのもの。
 * 費用の最終的な歯止めは予算ガードと OrcaRouter 側のキー上限が受け持つ。
 */
export async function assertAiRateLimit(input: {
  tenantId: string;
  userId: string;
  /** 絞り込む用途。省略するとその人のAI呼び出し全体で数える。 */
  requestType?: string;
  limit: number;
  windowSec?: number;
  message?: string;
}): Promise<void> {
  const since = new Date(new Date().getTime() - (input.windowSec ?? 60) * 1000).toISOString();
  let query = adminDb().from('agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', input.tenantId)
    .eq('actor_id', input.userId)
    .gte('created_at', since);
  if (input.requestType) query = query.eq('request_type', input.requestType);

  const { count, error } = await query;
  // 数えられないときに通してしまうと、制限が壊れたことに誰も気づけない。
  if (error) throw new TooManyRequests('混み合っています。時間をおいてもう一度お試しください。');
  if ((count ?? 0) >= input.limit) {
    throw new TooManyRequests(input.message ?? 'AIの利用が集中しています。少し待ってからもう一度お試しください。');
  }
}
