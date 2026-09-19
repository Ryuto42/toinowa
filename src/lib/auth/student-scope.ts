import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { ForbiddenError } from './errors';
import type { AuthContext } from './types';

/** 生徒を指定するAPIでは、teacherが担当するクラスまで明示的に照合する。 */
export async function assertStudentScope(context: AuthContext, studentId: string): Promise<void> {
  if (context.role === 'admin' || context.userId === studentId) return;
  if (context.role !== 'teacher') throw new ForbiddenError();
  const db = adminDb();
  const teacherClasses = await db.from('enrollments').select('classroom_id')
    .eq('tenant_id', context.tenantId).eq('user_id', context.userId).eq('role', 'teacher').eq('active', true);
  if (teacherClasses.error) throw new Error(teacherClasses.error.message);
  const classIds = (teacherClasses.data ?? []).map((row) => row.classroom_id);
  if (classIds.length === 0) throw new ForbiddenError('担当クラスがありません');
  const studentEnrollment = await db.from('enrollments').select('id')
    .eq('tenant_id', context.tenantId).eq('user_id', studentId).eq('role', 'student').eq('active', true)
    .in('classroom_id', classIds).limit(1).maybeSingle();
  if (studentEnrollment.error) throw new Error(studentEnrollment.error.message);
  if (!studentEnrollment.data) throw new ForbiddenError('担当外の生徒です');
}
