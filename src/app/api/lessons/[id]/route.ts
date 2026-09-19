import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };

const updateLessonSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  taughtAt: z.iso.date().nullable().optional(),
  objectives: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
  status: z.enum(['draft', 'material_ready', 'analyzed', 'published', 'archived']).optional(),
}).refine((value) => Object.keys(value).length > 0, '変更内容がありません');

export async function GET(_request: Request, route: Context) {
  try {
    const context = await requireAuth();
    const id = uuidParam((await route.params).id);
    const db = await createClient();
    const { data, error } = await db.from('lessons').select('*, concepts(*), materials(*)')
      .eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return json({ error: 'not_found' }, { status: 404 });
    return json({ lesson: data });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const id = uuidParam((await route.params).id);
    const body = await parseJson(request, updateLessonSchema);
    const db = await createClient();
    const { data, error } = await db.from('lessons').update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.taughtAt !== undefined ? { taught_at: body.taughtAt } : {}),
      ...(body.objectives !== undefined ? { objectives: body.objectives } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    }).eq('tenant_id', context.tenantId).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return json({ error: 'not_found' }, { status: 404 });
    return json({ lesson: data });
  } catch (error) {
    return routeError(error);
  }
}
