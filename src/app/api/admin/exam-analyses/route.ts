import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, parseJson, routeError, ApiInputError } from '@/lib/api/http';
import { documentImagesSchema, hasImageSignature } from '@/lib/materials/images';
import { examBaselineSchema } from '@/lib/materials/exam-analysis';
import { triggerWorkerTick } from '@/lib/jobs/queue';
import type { Json } from '@/lib/database/types';
export async function POST(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await parseJson(request, z.object({ id: z.uuid(), images: z.array(z.string()), baseline: examBaselineSchema }));
    const parsed = documentImagesSchema.safeParse({ purpose: 'exam', images: body.images });
    if (!parsed.success || !body.images.every(hasImageSignature)) throw new ApiInputError('PDFは8ページ、画像合計は3.5MB以内にしてください');
    const saved = await adminDb().rpc('queue_exam_analysis', { p_tenant: context.tenantId, p_actor: context.userId, p_analysis: body.id, p_images: body.images, p_baseline: body.baseline as Json });
    if (saved.error) throw new Error(saved.error.message);
    triggerWorkerTick();
    return json({ id: body.id }, { status: 202 });
  } catch (error) { return routeError(error); }
}
export async function GET() {
  try {
    const context = await requireRole('admin');
    const result = await adminDb().from('exam_analyses').select('id,status,student_id,created_at,completed_at,error_message,users!exam_analyses_student_id_fkey(display_name)').eq('tenant_id', context.tenantId).eq('created_by', context.userId).order('created_at', { ascending: false }).limit(10);
    if (result.error) throw new Error(result.error.message);
    return json({ analyses: result.data });
  } catch (error) { return routeError(error); }
}
