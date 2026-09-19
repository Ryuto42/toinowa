import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { json, parseJson, routeError } from '@/lib/api/http';

const createLessonSchema = z.object({
  classroomId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  taughtAt: z.iso.date().optional(),
  objectives: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
});

export async function GET() {
  try {
    const context = await requireRole('teacher', 'admin');
    const db = await createClient();
    const { data, error } = await db.from('lessons').select('*')
      .eq('tenant_id', context.tenantId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return json({ lessons: data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher', 'admin');
    const body = await parseJson(request, createLessonSchema);
    const db = await createClient();
    const { data, error } = await db.from('lessons').insert({
      tenant_id: context.tenantId,
      classroom_id: body.classroomId,
      title: body.title,
      taught_at: body.taughtAt ?? null,
      objectives: body.objectives,
      created_by: context.userId,
    }).select('*').single();
    if (error || !data) throw new Error(error?.message ?? 'lesson create failed');
    return json({ lesson: data }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
