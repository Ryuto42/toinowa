import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { createClient } from '@/lib/database/server';
import type { AuthContext } from '@/lib/auth/types';

/** 1回の心拍で加算できる上限(秒)。クライアント申告なので、まとめ送りの水増しを防ぐ。 */
const MAX_DELTA_SECONDS = 180;

async function assertAssignmentVisible(context: AuthContext, assignmentId: string) {
  // RLS付きクライアントで引くので、配信対象外の課題はそもそも見えない
  const { data, error } = await (await createClient())
    .from('assignments').select('id').eq('tenant_id', context.tenantId).eq('id', assignmentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('assignment not found');
}

/** 課題を開いた。未着手なら進行中にする。 */
export async function markOpened(context: AuthContext, assignmentId: string) {
  await assertAssignmentVisible(context, assignmentId);
  const now = new Date().toISOString();
  const { error } = await adminDb().from('assignment_progress').upsert({
    tenant_id: context.tenantId,
    assignment_id: assignmentId,
    student_id: context.userId,
    status: 'in_progress',
    opened_at: now,
    last_seen_at: now,
  }, { onConflict: 'assignment_id,student_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  // 既存行があった場合は opened_at を上書きせず、状態だけ進める。
  // 「最初に開いた時刻」は未着手判定の根拠なので保持する。
  const { error: bump } = await adminDb().from('assignment_progress')
    .update({ status: 'in_progress', last_seen_at: now })
    .eq('tenant_id', context.tenantId)
    .eq('assignment_id', assignmentId)
    .eq('student_id', context.userId)
    .eq('status', 'not_started');
  if (bump) throw new Error(bump.message);
}

/** 画面を開いていた時間を加算する。タブが背面のときクライアントは送ってこない。 */
export async function addActiveSeconds(context: AuthContext, assignmentId: string, delta: number) {
  const seconds = Math.min(MAX_DELTA_SECONDS, Math.max(0, Math.round(delta)));
  if (!seconds) return;
  const db = adminDb();
  const current = await db.from('assignment_progress').select('active_seconds')
    .eq('tenant_id', context.tenantId).eq('assignment_id', assignmentId)
    .eq('student_id', context.userId).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) return;
  const { error } = await db.from('assignment_progress').update({
    active_seconds: current.data.active_seconds + seconds,
    last_seen_at: new Date().toISOString(),
  }).eq('tenant_id', context.tenantId).eq('assignment_id', assignmentId).eq('student_id', context.userId);
  if (error) throw new Error(error.message);
}

/** 分析まで終わった。完了にする。 */
export async function markCompleted(tenantId: string, assignmentId: string, studentId: string) {
  const now = new Date().toISOString();
  const { error } = await adminDb().from('assignment_progress').upsert({
    tenant_id: tenantId,
    assignment_id: assignmentId,
    student_id: studentId,
    status: 'completed',
    completed_at: now,
    last_seen_at: now,
  }, { onConflict: 'assignment_id,student_id' });
  if (error) throw new Error(error.message);
}
