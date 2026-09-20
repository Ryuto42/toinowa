import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  teacherIds: z.array(z.uuid()).max(50).default([]),
  studentIds: z.array(z.uuid()).max(500).default([]),
});

/**
 * クラスの担当先生と在籍生徒をまとめて設定する。
 *
 * 送られてこなかった人は在籍を無効化する（行は消さない）。
 * 過去の課題・評価が在籍を前提にしているため、履歴を壊さないようにする。
 */
export async function PUT(request: Request, route: Context) {
  try {
    const context = await requireRole('admin');
    const classroomId = uuidParam((await route.params).id, 'classroomId');
    const body = await parseJson(request, schema);
    const overlap = body.teacherIds.filter((id) => body.studentIds.includes(id));
    if (overlap.length) {
      return json({ message: '同じ人を先生と生徒の両方に設定することはできません' }, { status: 400 });
    }
    const { error } = await adminDb().rpc('set_classroom_members', {
      p_tenant: context.tenantId,
      p_actor: context.userId,
      p_classroom: classroomId,
      p_teachers: body.teacherIds,
      p_students: body.studentIds,
    });
    if (error) throw new Error(error.message);
    recordAudit({
      tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin',
      action: 'classroom.members.set', resourceType: 'classroom', resourceId: classroomId,
      result: 'allow', detail: { teachers: body.teacherIds.length, students: body.studentIds.length },
    });
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
