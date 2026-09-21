import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, routeError, uuidParam } from '@/lib/api/http';
import { parseJson, ApiInputError } from '@/lib/api/http';
import { z } from 'zod';
import { examAnalysisResultSchema } from '@/lib/materials/exam-analysis';
import { applyExamAnalysis } from '@/lib/materials/apply-exam-analysis';
import { preCheck, postCheck } from '@/lib/security/guard';
import type { Json } from '@/lib/database/types';
export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('admin');
    const result = await adminDb().from('exam_analyses').select('id,status,result,error_message,student_id').eq('tenant_id', context.tenantId).eq('created_by', context.userId).eq('id', uuidParam((await route.params).id)).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data ? json(result.data) : json({ message: '分析が見つかりません' }, { status: 404 });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('admin');
    const id = uuidParam((await route.params).id);
    const body = await parseJson(request, z.object({ confirmed: z.literal(true), result: examAnalysisResultSchema }));
    const db = adminDb();
    const found = await db.from('exam_analyses').select('status,result').eq('id', id).eq('tenant_id', context.tenantId).eq('created_by', context.userId).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data) throw new ApiInputError('分析が見つかりません', 404);
    const stored = (found.data.result ?? {}) as Record<string, Json | undefined>;
    // If applying an already-approved result failed, retry only that saved result.
    if (found.data.status === 'completed' && stored.reviewedBy === context.userId) {
      await applyExamAnalysis(context.tenantId, id); return json({ ok: true });
    }
    if (found.data.status !== 'review_required') throw new ApiInputError('この分析は確認待ちではありません', 409);
    postCheck(JSON.stringify(body.result));
    const cleaned = examAnalysisResultSchema.parse(JSON.parse(preCheck(JSON.stringify(body.result)).masked.text));
    const updated = await db.from('exam_analyses').update({ status: 'completed', images: null,
      result: { ...stored, ...cleaned, reviewRequired: false, reviewedBy: context.userId, reviewedAt: new Date().toISOString() } as Json,
    }).eq('id', id).eq('tenant_id', context.tenantId).eq('created_by', context.userId).eq('status', 'review_required').select('id').maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) throw new ApiInputError('分析状態が変わりました。画面を更新してください', 409);
    await applyExamAnalysis(context.tenantId, id);
    return json({ ok: true });
  } catch (error) { return routeError(error); }
}

// 画像変換・アップロード前に失敗した場合も、登録済みの画面で状態を確認できるようにする。
export async function PATCH(_request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('admin');
    const id = uuidParam((await route.params).id);
    const db = adminDb();
    const created = await db.from('exam_analyses').upsert({ id, tenant_id: context.tenantId, created_by: context.userId }, { onConflict: 'id', ignoreDuplicates: true });
    if (created.error) throw new Error(created.error.message);
    const failed = await db.from('exam_analyses').update({ status: 'failed', images: null, error_message: 'アップロードできませんでした。ファイルを再選択してください。', completed_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', context.tenantId).eq('created_by', context.userId).eq('status', 'uploading');
    if (failed.error) throw new Error(failed.error.message);
    return json({ ok: true });
  } catch (error) { return routeError(error); }
}
