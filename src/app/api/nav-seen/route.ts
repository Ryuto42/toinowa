import { requireAuth } from '@/lib/auth/guard';
import { json, routeError } from '@/lib/api/http';
import { isNavKey, markSeen } from '@/lib/nav/seen';

/** メニューのバッジを消す。自分の既読しか動かせない。 */
export async function POST(request: Request) {
  try {
    const context = await requireAuth();
    const body = await request.json().catch(() => null) as { key?: unknown } | null;
    const key = body?.key;
    if (!isNavKey(key)) return json({ message: '不明なメニューです' }, { status: 400 });
    await markSeen(context.tenantId, context.userId, key);
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
