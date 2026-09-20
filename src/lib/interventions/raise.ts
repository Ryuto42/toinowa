import 'server-only';
import { adminDb } from '@/lib/database/admin';
import type { EscalationKind, InterventionPriority, Json } from '@/lib/database/types';

// enum は DB の生成型をそのまま使う。ここで再定義すると、
// マイグレーションで値が増えたときに静かにずれる。
export type { EscalationKind };
export type Priority = InterventionPriority;

export interface RaiseInput {
  tenantId: string;
  kind: EscalationKind;
  priority: Priority;
  title: string;
  studentId?: string | null;
  classroomId?: string | null;
  payload?: Record<string, unknown>;
  /** 同じ生徒・同じ種類の未対応案件がこの時間内にあれば起票しない */
  dedupeHours?: number;
}

/**
 * 先生への介入を起票する。
 *
 * 重複抑制が要点。同じ生徒に同じ種類の指摘を何度も積むと、
 * 介入一覧がノイズで埋まり、本当に見るべきものが埋もれる。
 * 未対応の同種案件がある間は、新しく作らず既存の payload を更新する。
 *
 * 起票の失敗で本処理を止めない（介入は補助的な通知であり、学習の本筋ではない）。
 */
export async function raiseEscalation(input: RaiseInput): Promise<string | null> {
  const db = adminDb();
  const windowHours = input.dedupeHours ?? 24;
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  try {
    let existing = db.from('escalations').select('id,payload')
      .eq('tenant_id', input.tenantId)
      .eq('kind', input.kind)
      .in('status', ['open', 'acknowledged'])
      .gte('created_at', since)
      .limit(1);
    existing = input.studentId
      ? existing.eq('student_id', input.studentId)
      : existing.is('student_id', null);

    const found = await existing.maybeSingle();
    if (found.error) throw new Error(found.error.message);

    if (found.data) {
      const previous = found.data.payload && typeof found.data.payload === 'object' && !Array.isArray(found.data.payload)
        ? found.data.payload as Record<string, unknown> : {};
      const occurrences = Number(previous.occurrences ?? 1) + 1;
      await db.from('escalations').update({
        // 繰り返し起きていること自体が情報なので回数を残す
        payload: { ...previous, ...(input.payload ?? {}), occurrences, last_seen_at: new Date().toISOString() } as Json,
      }).eq('id', found.data.id);
      return found.data.id;
    }

    const inserted = await db.from('escalations').insert({
      tenant_id: input.tenantId,
      student_id: input.studentId ?? null,
      classroom_id: input.classroomId ?? null,
      kind: input.kind,
      priority: input.priority,
      title: input.title,
      payload: { ...(input.payload ?? {}), occurrences: 1 } as Json,
    }).select('id').single();
    if (inserted.error) throw new Error(inserted.error.message);
    return inserted.data.id;
  } catch (error) {
    console.error('[escalations] 起票に失敗:', error);
    return null;
  }
}

/** 生徒が在籍する最初のクラス。介入を先生の担当範囲へ結び付けるために使う。 */
export async function classroomOfStudent(tenantId: string, studentId: string): Promise<string | null> {
  const { data } = await adminDb().from('enrollments').select('classroom_id')
    .eq('tenant_id', tenantId).eq('user_id', studentId).eq('role', 'student').eq('active', true)
    .order('id').limit(1).maybeSingle();
  return data?.classroom_id ?? null;
}
