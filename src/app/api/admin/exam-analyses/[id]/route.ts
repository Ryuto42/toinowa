import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, routeError, uuidParam } from '@/lib/api/http';
export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('admin');
    const result = await adminDb().from('exam_analyses').select('id,status,result,error_message,student_id').eq('tenant_id', context.tenantId).eq('created_by', context.userId).eq('id', uuidParam((await route.params).id)).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data ? json(result.data) : json({ message: '分析が見つかりません' }, { status: 404 });
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
