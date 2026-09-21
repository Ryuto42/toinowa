import { applyExamAnalysis } from '@/lib/materials/apply-exam-analysis';
import { generateStudentCredentials } from '@/lib/auth/student-credentials';
import { hasPlanningEvidence, studentIntakeSchema } from '@/lib/plans/schema';
import { enqueueJob, triggerWorkerTick } from '@/lib/jobs/queue';
import { preCheck } from '@/lib/security/guard';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { adminDb } from '@/lib/database/admin';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, ApiInputError, routeError } from '@/lib/api/http';

const createUserSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.email().optional(),
  role: z.enum(['student', 'teacher', 'admin']),
  intake: studentIntakeSchema.optional(),
  examAnalysisId: z.uuid().optional(),
  teacherIds: z.array(z.uuid()).max(30).default([]),
}).refine(value => value.role !== 'student' || Boolean(value.intake), '生徒の学年を入力してください').refine(value => value.role === 'student' || Boolean(value.email), '先生・管理者のメールアドレスを入力してください');

export async function GET() {
  try {
    const context = await requireRole('admin');
    const { data, error } = await (await createClient()).from('users').select('id,role,display_name,email,login_identifier,status,created_at').eq('tenant_id', context.tenantId).order('role').order('display_name');
    if (error) throw new Error(error.message);
    return json({ users: data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  let authUserId: string | null = null;
  try {
    const context = await requireRole('admin');
    const body = await parseJson(request, createUserSchema);
    const db = adminDb();
    const credentials = generateStudentCredentials();
    const codes = await (await createClient()).from('school_codes').select('code').eq('tenant_id', context.tenantId).eq('active', true).order('code').limit(1);
    if (codes?.error) throw new Error(codes.error.message);
    if (credentials && !codes?.data?.length) throw new ApiInputError('有効な所属コードを設定してからユーザーを登録してください');
    if (body.intake?.classroomId) {
      const classroom = await db.from('classrooms').select('id').eq('tenant_id', context.tenantId).eq('id', body.intake.classroomId).is('individual_student_id', null).is('archived_at', null).maybeSingle();
      if (classroom.error || !classroom.data) throw new Error('クラスが見つかりません');
    }
    if (body.intake) {
      body.intake.learningGoal = preCheck(body.intake.learningGoal).masked.text;
      if (body.intake.examResults) body.intake.examResults = preCheck(body.intake.examResults).masked.text;
      if (body.intake.weakAreas) body.intake.weakAreas = preCheck(body.intake.weakAreas).masked.text;
    }
    const { data: created, error: authError } = await db.auth.admin.createUser({ email: body.role === 'student' ? credentials.authEmail : body.email!, password: credentials.initialPassword, email_confirm: true, user_metadata: { tenant_id: context.tenantId } });
    if (authError || !created.user) throw new Error(authError?.message ?? 'auth user create failed');
    authUserId = created.user.id;
    const { data: registered, error: userError } = await db.from('users').insert({ id: authUserId, tenant_id: context.tenantId, role: body.role, display_name: body.displayName, email: body.role === 'student' ? null : body.email!, must_change_password: true, status: 'active' }).select('login_identifier').single();
    if (userError) throw new Error(userError.message);
    const loginIdentifier = registered.login_identifier;
    if (body.role === 'student' && !loginIdentifier) throw new Error('ログインIDを発行できませんでした');
    if (body.role === 'student') {
      const { error: profileError } = await db.from('student_profiles').insert({ user_id: authUserId, tenant_id: context.tenantId, grade: body.intake!.grade, learning_goal: body.intake!.learningGoal, exam_results: body.intake!.examResults, weak_areas: body.intake!.weakAreas, daily_time_limit_min: body.intake!.dailyTimeLimitMin });
      if (profileError) throw new Error(profileError.message);
      const personal = await db.rpc('set_student_teachers', { p_tenant: context.tenantId, p_actor: context.userId, p_student: authUserId, p_teachers: body.teacherIds });
      if (personal.error) throw new ApiInputError(personal.error.code==='P0001' ? personal.error.message : '担当を設定できませんでした');
      if (body.intake!.classroomId) {
      const enrollment = await db.from('enrollments').insert({ tenant_id: context.tenantId, classroom_id: body.intake!.classroomId, user_id: authUserId, role: 'student', active: true });
      if (enrollment.error) throw new Error(enrollment.error.message);
      }
      if (body.examAnalysisId) {
        const attached = await db.rpc('attach_exam_analysis', { p_tenant: context.tenantId, p_actor: context.userId, p_student: authUserId, p_analysis: body.examAnalysisId });
        if (attached.error) throw new Error(attached.error.message);
        await applyExamAnalysis(context.tenantId, body.examAnalysisId);
      } else if (hasPlanningEvidence(body.intake!)) {
      const job = await enqueueJob({ tenantId: context.tenantId, kind: 'build_learning_plan', idempotencyKey: `onboarding:${authUserId}`, payload: { studentId: authUserId, requestedBy: context.userId, classroomId: body.intake!.classroomId ?? personal.data }, traceId: crypto.randomUUID() });
      if (!job) throw new Error('学習計画を予約できませんでした');
      triggerWorkerTick();
      }
    }
    recordAudit({ tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin', action: 'user.create', resourceType: 'user', resourceId: authUserId, result: 'allow', detail: { role: body.role } });
    return json({ user: { id: authUserId, role: body.role, displayName: body.displayName }, ...(credentials ? { credentials: { organizationCode: codes!.data![0].code, loginIdentifier: loginIdentifier ?? body.email!, initialPassword: credentials.initialPassword } } : {}) }, { status: 201 });
  } catch (error) {
    if (authUserId) await adminDb().auth.admin.deleteUser(authUserId).catch(() => undefined);
    return routeError(error);
  }
}
