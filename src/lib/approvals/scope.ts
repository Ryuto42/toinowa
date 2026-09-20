import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { assertStudentScope } from '@/lib/auth/student-scope';
import type { AuthContext } from '@/lib/auth/types';
import { ForbiddenError } from '@/lib/auth/errors';

export async function assertApprovalScope(context: AuthContext, type: string, id: string) {
  if (context.role === 'admin') return;
  if (context.role !== 'teacher') throw new ForbiddenError();
  const db = adminDb();
  if (type === 'assessment' || type === 'plan') {
    const record = await db.from(type === 'assessment' ? 'assessments' : 'learning_plans').select('student_id').eq('tenant_id', context.tenantId).eq('id', id).single();
    if (record.error) throw new Error(record.error.message);
    await assertStudentScope(context, record.data.student_id);
    return;
  }
  if (type === 'assignment') {
    const record = await db.from('assignments').select('student_id,classroom_id').eq('tenant_id', context.tenantId).eq('id', id).single();
    if (record.error) throw new Error(record.error.message);
    if (record.data.student_id) { await assertStudentScope(context, record.data.student_id); return; }
    const enrollment = await db.from('enrollments').select('id').eq('tenant_id', context.tenantId).eq('user_id', context.userId).eq('role', 'teacher').eq('active', true).eq('classroom_id', record.data.classroom_id ?? '').maybeSingle();
    if (enrollment.error) throw new Error(enrollment.error.message);
    if (!enrollment.data) throw new ForbiddenError();
    return;
  }
  throw new ForbiddenError();
}

export async function visibleApprovals(context: AuthContext) {
  const result = await adminDb().from('approvals').select('*').eq('tenant_id', context.tenantId).is('decision', null).order('created_at');
  if (result.error) throw new Error(result.error.message);
  const visible = [];
  for (const item of result.data ?? []) {
    try { await assertApprovalScope(context, item.resource_type, item.resource_id); visible.push(item); }
    catch (error) { if (!(error instanceof ForbiddenError)) throw error; }
  }
  return Promise.all(visible.map(async item => {
    const db = adminDb();
    if (item.resource_type === 'assignment') {
      const record = await db.from('assignments').select('student_id,users!assignments_student_id_fkey(display_name),classrooms(name),learning_plans(rationale)')
        .eq('tenant_id', context.tenantId).eq('id', item.resource_id).single();
      if (record.error) throw new Error(record.error.message);
      return { ...item, studentId: record.data.student_id, targetName: record.data.users?.display_name ?? 'クラス全員', classroomName: record.data.classrooms?.name ?? '', rationale: record.data.learning_plans?.rationale ?? '' };
    }
    if (item.resource_type === 'assessment' || item.resource_type === 'plan') {
      const record = await db.from(item.resource_type === 'assessment' ? 'assessments' : 'learning_plans').select('student_id')
        .eq('tenant_id', context.tenantId).eq('id', item.resource_id).single();
      if (record.error) throw new Error(record.error.message);
      const student = await db.from('users').select('display_name').eq('tenant_id', context.tenantId).eq('id', record.data.student_id).single();
      if (student.error) throw new Error(student.error.message);
      return { ...item, studentId: record.data.student_id, targetName: student.data.display_name, classroomName: '', rationale: '' };
    }
    return { ...item, studentId: null, targetName: '', classroomName: '', rationale: '' };
  }));
}
