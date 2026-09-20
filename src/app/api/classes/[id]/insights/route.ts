import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { json, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const classroomId = uuidParam((await route.params).id, 'classroomId');
    const db = await createClient();
    const classroom = await db.from('classrooms').select('*').eq('tenant_id', context.tenantId)
      .eq('id', classroomId).maybeSingle();
    if (classroom.error) throw new Error(classroom.error.message);
    if (!classroom.data) return json({ error: 'not_found' }, { status: 404 });
    const enrollments = await db.from('enrollments').select('user_id').eq('tenant_id', context.tenantId)
      .eq('classroom_id', classroomId).eq('role', 'student').eq('active', true);
    if (enrollments.error) throw new Error(enrollments.error.message);
    const studentIds = (enrollments.data ?? []).map((row) => row.user_id);
    const assessments = studentIds.length
      ? await db.from('assessments').select('score,confidence,reviewer_status,misconceptions,student_id,concept_id')
        .eq('tenant_id', context.tenantId).in('student_id', studentIds)
      : { data: [], error: null };
    if (assessments.error) throw new Error(assessments.error.message);
    const rows = assessments.data ?? [];
    const scores = rows.flatMap((row) => row.score === null ? [] : [Number(row.score)]);
    return json({
      classroom: classroom.data,
      metrics: {
        students: studentIds.length,
        assessments: rows.length,
        averageScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
        lowConfidence: rows.filter((row) => Number(row.confidence) < 0.6).length,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
