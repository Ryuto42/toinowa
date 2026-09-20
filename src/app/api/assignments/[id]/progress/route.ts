import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { addActiveSeconds, markOpened } from '@/lib/progress/service';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  event: z.enum(['open', 'heartbeat']),
  /** 前回の送信からタブが前面だった秒数 */
  activeSeconds: z.number().int().min(0).max(600).default(0),
});

/**
 * 生徒が説明ワークを開いている間の状態を記録する。
 *
 * 心拍はクライアントが可視状態のときだけ送るので、開きっぱなしのタブは
 * 学習時間に数えない。完了は分析ジョブ側から記録する（生徒が申告しない）。
 */
export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('student');
    const assignmentId = uuidParam((await route.params).id, 'assignmentId');
    const body = await parseJson(request, schema);
    if (body.event === 'open') await markOpened(context, assignmentId);
    if (body.activeSeconds > 0) await addActiveSeconds(context, assignmentId, body.activeSeconds);
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
