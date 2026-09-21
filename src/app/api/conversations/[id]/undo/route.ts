import { requireRole } from '@/lib/auth/guard';
import { undoLastExchange } from '@/lib/conversation/service';
import { json, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };

/** 直前の1往復を取り消す。取り消せるのは1回分だけ。 */
export async function POST(_request: Request, route: Context) {
  try {
    const context = await requireRole('student');
    const conversationId = uuidParam((await route.params).id, 'conversationId');
    const result = await undoLastExchange(context, conversationId);
    return json(result);
  } catch (error) {
    return routeError(error);
  }
}
