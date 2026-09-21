import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, routeError } from '@/lib/api/http';

/**
 * 先生の画面を自動更新するための「今の状態の指紋」を返す。
 *
 * 長時間つなぎっぱなしのSSEはVercelの関数時間と相性が悪いので、
 * 軽い問い合わせを繰り返す形にしている。返すのは件数と最新IDだけで、
 * 変わったときにだけ画面側が再取得する。
 */
export async function GET() {
  try {
    const context = await requireRole('teacher', 'admin');
    const db = adminDb();
    const [runs, answers, escalations] = await Promise.all([
      db.from('agent_runs').select('id,created_at').eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false }).limit(1),
      db.from('answers').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId),
      db.from('escalations').select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']),
    ]);
    if (runs.error) throw new Error(runs.error.message);
    return json({
      version: [runs.data?.[0]?.id ?? '-', answers.count ?? 0, escalations.count ?? 0].join(':'),
      latestRunAt: runs.data?.[0]?.created_at ?? null,
    });
  } catch (error) {
    return routeError(error);
  }
}
