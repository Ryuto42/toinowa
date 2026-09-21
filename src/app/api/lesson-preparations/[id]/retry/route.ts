import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, routeError, uuidParam, ApiInputError } from '@/lib/api/http';
import { triggerWorkerTick } from '@/lib/jobs/queue';
export async function POST(_request:Request, route:{params:Promise<{id:string}>}) {
  try {
    const context=await requireRole('teacher','admin');
    const id=uuidParam((await route.params).id);
    const result=await adminDb().rpc('retry_lesson_preparation',{p_tenant:context.tenantId,p_actor:context.userId,p_id:id});
    if(result.error) throw new ApiInputError(result.error.code==='P0001' ? result.error.message : '再試行を予約できませんでした');
    if(result.data) triggerWorkerTick();
    return json({count:result.data});
  } catch(error) { return routeError(error); }
}
