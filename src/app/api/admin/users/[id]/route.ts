import { applyExamAnalysis } from '@/lib/materials/apply-exam-analysis';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { recordAudit } from '@/lib/security/audit';
import { preCheck } from '@/lib/security/guard';
import { userUpdateSchema } from '@/lib/auth/user-update';
import { json, parseJson, routeError, uuidParam, ApiInputError } from '@/lib/api/http';
import type { Json } from '@/lib/database/types';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, route: Context) {
  try {
    const context = await requireRole('admin');
    const id = uuidParam((await route.params).id);
    const body = await parseJson(request, userUpdateSchema);
    const db = adminDb();
    const current = await db.from('users').select('role,email').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return json({ message: 'ユーザーが見つかりません' }, { status: 404 });
    if ((body.profile || body.examAnalysisId || body.loginIdentifier !== undefined) && current.data.role !== 'student') throw new ApiInputError('この項目は生徒のみ変更できます');
    if (body.loginIdentifier === null && !current.data.email) throw new ApiInputError('ログインIDは必須です');
    if (id === context.userId && body.status && body.status !== 'active') throw new ApiInputError('自分自身の利用を停止することはできません');
    if (body.profile) {
      for (const field of ['grade', 'learningGoal', 'examResults', 'weakAreas'] as const) {
        if (body.profile[field]) body.profile[field] = preCheck(body.profile[field]).masked.text;
      }
    }
    const saved = await db.rpc('edit_managed_user', { p_tenant: context.tenantId, p_actor: context.userId, p_user: id, p_patch: body as Json });
    if (saved.error?.code === '23505') throw new ApiInputError('このログインIDは既に使われています');
    if (saved.error) throw new Error(saved.error.message);
    if (body.examAnalysisId) {
      const attached = await db.rpc('attach_exam_analysis', { p_tenant: context.tenantId, p_actor: context.userId, p_student: id, p_analysis: body.examAnalysisId });
      if (attached.error) throw new Error(attached.error.message);
      await applyExamAnalysis(context.tenantId, body.examAnalysisId);
    }
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin', action: 'user.update', resourceType: 'user', resourceId: id, result: 'allow', detail: { fields: Object.keys(body) } });
    return json({ user: { id, ...(body.status ? { status: body.status } : {}) } });
  } catch (error) { return routeError(error); }
}
