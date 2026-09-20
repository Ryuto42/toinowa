import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { json, parseJson, routeError } from '@/lib/api/http';

const createAssignmentSchema = z.object({
  lessonId: z.uuid(),
  classroomId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  questionIds: z.array(z.uuid()).min(1).max(50),
  kind: z.enum(['initial', 'review', 'reassessment']).default('initial'),
  dueAt: z.iso.datetime().optional(),
}).refine((value) => value.classroomId || value.studentId, '配信先が必要です');

export async function GET(request: Request) {
  try {
    const context = await requireAuth();
    const studentId = new URL(request.url).searchParams.get('studentId');
    const db = await createClient();
    let query = db.from('assignments').select('*').eq('tenant_id', context.tenantId);
    if (studentId) query = query.eq('student_id', studentId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return json({ assignments: data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher', 'admin');
    const body = await parseJson(request, createAssignmentSchema);
    const db = await createClient();
    const questionCheck = await db.from('questions').select('id,format').eq('tenant_id', context.tenantId).in('id', body.questionIds);
    if (questionCheck.error) throw new Error(questionCheck.error.message);
    const validIds = new Set((questionCheck.data ?? []).filter((question) => question.format === 'explain').map((question) => question.id));
    if (validIds.size !== body.questionIds.length) throw new Error('概念説明ワークに使える説明形式のテーマだけを選択してください');
    const { data, error } = await db.from('assignments').insert({
      tenant_id: context.tenantId,
      lesson_id: body.lessonId,
      classroom_id: body.classroomId ?? null,
      student_id: body.studentId ?? null,
      question_ids: body.questionIds,
      kind: body.kind,
      due_at: body.dueAt ?? null,
      status: 'published',
      published_at: new Date().toISOString(),
      approved_by: context.userId,
    }).select('*').single();
    if (error || !data) throw new Error(error?.message ?? 'assignment create failed');
    return json({ assignment: data, published: true }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
