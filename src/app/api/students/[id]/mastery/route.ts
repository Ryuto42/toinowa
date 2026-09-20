import { assertSelfOrRole, requireAuth } from '@/lib/auth/guard';
import { studentFeedback } from '@/lib/mastery/student-feedback';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { createClient } from '@/lib/database/server';
import { json, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: Context) {
  try {
    const context = await requireAuth();
    const studentId = uuidParam((await route.params).id, 'studentId');
    assertSelfOrRole(context, studentId, 'teacher', 'admin');
    await assertStudentScope(context, studentId);
    if (context.role === 'student') return json({ feedback: await studentFeedback(context) });
    const db = await createClient();
    const { data, error } = await db.from('assessments')
      .select('*, concepts(name, lesson_id)')
      .eq('tenant_id', context.tenantId).eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const latest = new Map<string, (typeof data)[number]>();
    for (const row of data ?? []) if (!latest.has(row.concept_id)) latest.set(row.concept_id, row);
    const rows = [...latest.values()];
    const scores = rows.flatMap((row) => row.score === null ? [] : [Number(row.override_score ?? row.score)]);
    return json({
      studentId,
      concepts: rows,
      overall: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      pendingReview: rows.filter((row) => row.reviewer_status === 'pending_review').length,
    });
  } catch (error) {
    return routeError(error);
  }
}
