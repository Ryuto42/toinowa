import { queuePlanFromAssessment } from '@/lib/plans/followup';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
// 確認待ちの評価には「そのまま確定する」道が要る。上書きしかないと、
// 内容に問題が無い評価が確認待ちのまま残り、生徒にも返らない。
const schema = z.union([
  z.object({ action: z.literal('approve') }),
  z.object({ score: z.number().min(0).max(1), note: z.string().trim().min(1).max(2_000) }),
]);

export async function POST(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher','admin'); const id=uuidParam((await route.params).id,'assessmentId'); const body=await parseJson(request,schema);
    const visible=await(await createClient()).from('assessments').select('id,student_id').eq('tenant_id',context.tenantId).eq('id',id).maybeSingle();
    if(visible.error) throw new Error(visible.error.message); if(!visible.data) return json({error:'not_found'},{status:404});
    const approving = 'action' in body;
    const review = { reviewed_by: context.userId, reviewed_at: new Date().toISOString() };
    const updated=await adminDb().from('assessments').update(approving
      ? { reviewer_status:'approved' as const, ...review }
      : { override_score:body.score, override_note:body.note, reviewer_status:'overridden' as const, ...review }
    ).eq('tenant_id',context.tenantId).eq('id',id).select('*').single();
    if(updated.error||!updated.data) throw new Error(updated.error?.message??'assessment review failed');
    recordAudit({tenantId:context.tenantId,actorId:context.userId,actorRole:context.role,action:approving?'assessment.approve':'assessment.override',resourceType:'assessment',resourceId:id,result:'allow',detail:approving?{}:{score:body.score,note:body.note}});
    // そのまま確定した場合は評価が変わっていないので、次回案は作り直さない。
    if(!approving) await queuePlanFromAssessment(context.tenantId, id);
    return json({assessment:updated.data});
  } catch(error){return routeError(error)}
}
