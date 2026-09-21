import 'server-only';
import { adminDb } from '@/lib/database/admin';
import type { GuardEventRow } from '@/components/guard-event-feed';

/**
 * 要フォロー画面に出す遮断記録。
 *
 * guard_events は service_role からしか読めないため、先生の場合は
 * 見てよい生徒を先に絞り込み、その範囲だけを取り出す。
 */
export async function recentGuardEvents(
  tenantId: string,
  studentIds: string[] | null,
  limit = 20,
): Promise<GuardEventRow[]> {
  if (studentIds && !studentIds.length) return [];
  let query = adminDb()
    .from('guard_events')
    .select('id,source,category,rule,matched_excerpt,blocked_tools,created_at,student_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (studentIds) query = query.in('student_id', studentIds);

  const { data, error } = await query;
  if (error || !data?.length) return [];

  const ids = [...new Set(data.map((row) => row.student_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await adminDb().from('users').select('id,display_name').in('id', ids);
    for (const user of users ?? []) names.set(user.id, user.display_name);
  }
  return data.map((row) => ({ ...row, student_name: row.student_id ? names.get(row.student_id) ?? null : null }));
}
