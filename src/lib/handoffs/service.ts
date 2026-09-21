import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { assertStudentScope } from '@/lib/auth/student-scope';
import { ForbiddenError } from '@/lib/auth/errors';
import { ApiInputError } from '@/lib/api/http';
import type { AuthContext } from '@/lib/auth/types';
import type { HandoffReason, Json } from '@/lib/database/types';

/**
 * 引き継ぎ時点の様子を凍結して残す。
 *
 * 理解度も課題もあとから変わるので、受け取った先生が
 * 「何を見て引き継がれたのか」を後から辿れなくなる。
 */
async function buildSnapshot(tenantId: string, studentId: string) {
  const db = adminDb();
  const [assessments, escalations, progress] = await Promise.all([
    db.from('assessments').select('score,override_score,misconceptions,created_at,concepts(name)')
      .eq('tenant_id', tenantId).eq('student_id', studentId).eq('is_final', true)
      .order('created_at', { ascending: false }).limit(5),
    db.from('escalations').select('kind,title').eq('tenant_id', tenantId).eq('student_id', studentId)
      .in('status', ['open', 'acknowledged']).order('created_at', { ascending: false }).limit(5),
    db.from('assignment_progress').select('status').eq('tenant_id', tenantId).eq('student_id', studentId),
  ]);

  const rows = assessments.data ?? [];
  const scores = rows.flatMap((row) => {
    const value = row.override_score ?? row.score;
    return value === null ? [] : [Number(value)];
  });
  const misconceptions = new Map<string, string>();
  for (const row of rows) {
    const items = Array.isArray(row.misconceptions) ? row.misconceptions : [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const code = typeof record.code === 'string' ? record.code : null;
      if (code) misconceptions.set(code, typeof record.label === 'string' ? record.label : code);
    }
  }
  const counts = (progress.data ?? []).reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    capturedAt: new Date().toISOString(),
    averageScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    assessedConcepts: rows.map((row) => row.concepts?.name ?? '単元').slice(0, 5),
    misconceptions: [...misconceptions.values()].slice(0, 6),
    openInterventions: (escalations.data ?? []).map((row) => row.title),
    works: { completed: counts.completed ?? 0, inProgress: counts.in_progress ?? 0, notStarted: counts.not_started ?? 0 },
  };
}

export async function createHandoff(input: {
  context: AuthContext; studentId: string; toUser: string; reason: HandoffReason; note: string;
}): Promise<string> {
  const { context } = input;
  if (input.toUser === context.userId) throw new ForbiddenError('自分自身には引き継げません');
  // 送り手はその生徒を担当していること。担当外の生徒を勝手に他人へ回せないようにする。
  await assertStudentScope(context, input.studentId);

  const db = adminDb();
  const receiver = await db.from('users').select('id,role,status')
    .eq('tenant_id', context.tenantId).eq('id', input.toUser).maybeSingle();
  if (receiver.error) throw new Error(receiver.error.message);
  if (!receiver.data || receiver.data.status !== 'active') throw new ApiInputError('引き継ぎ先が見つかりません', 404);
  if (receiver.data.role !== 'teacher' && receiver.data.role !== 'admin') {
    throw new ForbiddenError('引き継ぎ先には先生を指定してください');
  }

  const classroom = await db.from('enrollments').select('classroom_id')
    .eq('tenant_id', context.tenantId).eq('user_id', input.studentId).eq('role', 'student').eq('active', true)
    .order('id').limit(1).maybeSingle();

  const inserted = await db.from('handoffs').insert({
    tenant_id: context.tenantId,
    student_id: input.studentId,
    from_user: context.userId,
    to_user: input.toUser,
    classroom_id: classroom.data?.classroom_id ?? null,
    reason: input.reason,
    note: input.note,
    snapshot: await buildSnapshot(context.tenantId, input.studentId) as unknown as Json,
  }).select('id').single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data.id;
}

export async function respondToHandoff(input: {
  context: AuthContext; handoffId: string; decision: 'accepted' | 'declined' | 'cancelled'; note: string;
}) {
  const db = adminDb();
  const found = await db.from('handoffs').select('id,from_user,to_user,status')
    .eq('tenant_id', input.context.tenantId).eq('id', input.handoffId).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (!found.data) throw new ApiInputError('引き継ぎが見つかりません', 404);
  if (found.data.status !== 'pending') throw new ForbiddenError('この引き継ぎはすでに処理済みです');

  // 受け取り・見送りは受け手だけ、取り下げは送り手だけ。管理者は代行できる。
  const isAdmin = input.context.role === 'admin';
  const allowed = input.decision === 'cancelled'
    ? found.data.from_user === input.context.userId
    : found.data.to_user === input.context.userId;
  if (!allowed && !isAdmin) throw new ForbiddenError();

  const updated = await db.from('handoffs').update({
    status: input.decision,
    responded_at: new Date().toISOString(),
    response_note: input.note || null,
  }).eq('tenant_id', input.context.tenantId).eq('id', input.handoffId).select('*').single();
  if (updated.error) throw new Error(updated.error.message);
  return updated.data;
}
