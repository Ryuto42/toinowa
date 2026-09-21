import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { ApiInputError, json, parseJson, routeError, traceIdFrom } from '@/lib/api/http';
import { preCheck } from '@/lib/security/guard';
import { recordAudit } from '@/lib/security/audit';
const reviewItem = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(4000), content: z.string().max(20000), difficulty: z.number().int().min(1).max(5), dueAt: z.iso.datetime({ offset: true }).nullable() });
export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher','admin');
    const input = await parseJson(request,z.object({ items: z.array(reviewItem).min(1).max(100), publish: z.boolean() }));
    const items = input.items.map(item => ({ ...item, title: preCheck(item.title).masked.text, body: preCheck(item.body).masked.text, content: item.content ? preCheck(item.content).masked.text : '' }));
    const result = await adminDb().rpc('review_explanation_works',{p_tenant:context.tenantId,p_actor:context.userId,p_items:items,p_publish:input.publish});
    if(result.error) throw new ApiInputError(result.error.code === 'P0001' ? result.error.message : '課題を保存できませんでした');
    recordAudit({ tenantId:context.tenantId,actorId:context.userId,actorRole:context.role,action:input.publish?'topic.approve_publish':'topic.update',resourceType:'assignment',result:'allow',traceId:traceIdFrom(request),detail:{assignmentIds:items.map(item=>item.id),count:result.data} });
    return json({count:result.data});
  } catch(error) { return routeError(error); }
}
