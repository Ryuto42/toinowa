import { z } from 'zod';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { topicAgent } from '@/lib/materials/topic';
import { topicStudentContext } from '@/lib/materials/student-context';
import { json, parseJson, routeError, traceIdFrom, ApiInputError } from '@/lib/api/http';
import { preCheck } from '@/lib/security/guard';
import { recordAudit } from '@/lib/security/audit';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), classroomId: z.uuid(), studentId: z.uuid().optional(), title: z.string().trim().max(200).default(''), content: z.string().trim().max(20000).default('') }).refine(value => Boolean(value.title || value.content), 'テーマか学んだ内容を入力してください'),
  z.object({ action: z.literal('publish'), dueAt: z.iso.datetime(), studentId: z.uuid().optional(), classroomId: z.uuid(), content: z.string().max(20000), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(4000), difficulty: z.number().int().min(1).max(5) }),
]);
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher', 'admin');
    const body = await parseJson(request, schema);
    const db = await createClient();
    const classroom = await db.from('classrooms').select('id,subject,grade').eq('tenant_id', context.tenantId).eq('id', body.classroomId).maybeSingle();
    if (classroom.error) throw new Error(classroom.error.message);
    if (!classroom.data) throw new ApiInputError('担当クラスを選択してください');
    if (body.studentId) {
      await assertStudentScope(context, body.studentId);
      const enrollment = await db.from('enrollments').select('id').eq('tenant_id', context.tenantId).eq('classroom_id', body.classroomId).eq('user_id', body.studentId).eq('role', 'student').eq('active', true).maybeSingle();
      if (enrollment.error) throw new Error(enrollment.error.message);
      if (!enrollment.data) throw new ApiInputError('選択したクラスの生徒を指定してください');
    }
    const content = body.content ? preCheck(body.content).masked.text : '';
    const traceId = traceIdFrom(request);
    if (body.action === 'propose') {
      const history = body.studentId ? await topicStudentContext(context, body.studentId, body.classroomId) : null;
      const proposal = await topicAgent.run({ content, theme: body.title ? preCheck(body.title).masked.text : '', subject: classroom.data.subject ?? '', grade: classroom.data.grade ?? '', studentContext: history?.text ?? '' }, { tenantId: context.tenantId, userId: context.userId, studentId: body.studentId, traceId, modelClass: 'standard' });
      return json({ proposal: proposal.data, history: { conversationsUsed: history?.conversationsUsed ?? 0, feedbackUsed: history?.feedbackUsed ?? 0 } });
    }
    if (new Date(body.dueAt).getTime() <= Date.now()) throw new ApiInputError('今より後の期限を設定してください');
    const saved = await adminDb().rpc('create_explanation_work', { p_tenant: context.tenantId, p_actor: context.userId, p_classroom: body.classroomId,
      p_title: preCheck(body.title).masked.text, p_body: preCheck(body.body).masked.text, p_content: content, p_difficulty: body.difficulty, p_publish: true, p_due_at: body.dueAt, ...(body.studentId ? { p_student: body.studentId } : {}) });
    if (saved.error) throw new Error(saved.error.message);
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: context.role, action: 'topic.publish', resourceType: 'assignment', resourceId: saved.data, result: 'allow', traceId });
    return json({ assignmentId: saved.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
