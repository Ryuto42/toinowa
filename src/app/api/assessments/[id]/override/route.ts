import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ score: z.number().min(0).max(1), note: z.string().trim().min(1).max(2_000) });

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher','admin'); const id=uuidParam((await route.params).id,'assessmentId'); const body=await parseJson(request,schema);
    const visible=await(await createClient()).from('assessments').select('id,student_id').eq('tenant_id',context.tenantId).eq('id',id).maybeSingle();
    if(visible.error) throw new Error(visible.error.message); if(!visible.data) return json({error:'not_found'},{status:404});
    const updated=await adminDb().from('assessments').update({override_score:body.score,override_note:body.note,reviewer_status:'overridden',reviewed_by:context.userId,reviewed_at:new Date().toISOString()}).eq('tenant_id',context.tenantId).eq('id',id).select('*').single();
    if(updated.error||!updated.data) throw new Error(updated.error?.message??'assessment override failed');
    recordAudit({tenantId:context.tenantId,actorId:context.userId,actorRole:context.role,action:'assessment.override',resourceType:'assessment',resourceId:id,result:'allow',detail:{score:body.score,note:body.note}});
    return json({assessment:updated.data});
  } catch(error){return routeError(error)}
}
