import 'server-only';
import { adminDb } from '@/lib/database/admin';

/** メニューのバッジ単位。href ではなくキーで持つ。URLを変えても既読が飛ばない。 */
export type NavKey =
  | 'student_study' | 'student_records'
  | 'teacher_assignments' | 'teacher_interventions' | 'teacher_handoffs'
  | 'admin_interventions' | 'admin_handoffs';

/** 既読が無いときの基準。初回は「その時点以降に増えたもの」だけを未確認にする。 */
const EPOCH = '1970-01-01T00:00:00Z';

export async function seenAtFor(userId: string, keys: NavKey[]): Promise<Record<string, string>> {
  const { data } = await adminDb().from('nav_seen').select('nav_key,seen_at').eq('user_id', userId).in('nav_key', keys);
  const map: Record<string, string> = {};
  for (const key of keys) map[key] = EPOCH;
  for (const row of data ?? []) map[row.nav_key] = row.seen_at;
  return map;
}

export async function markSeen(tenantId: string, userId: string, key: NavKey): Promise<void> {
  const { error } = await adminDb().from('nav_seen')
    .upsert({ tenant_id: tenantId, user_id: userId, nav_key: key, seen_at: new Date().toISOString() },
      { onConflict: 'user_id,nav_key' });
  if (error) console.error('[nav_seen] 既読の保存に失敗:', error.message);
}

const NAV_KEYS: readonly NavKey[] = [
  'student_study', 'student_records',
  'teacher_assignments', 'teacher_interventions', 'teacher_handoffs',
  'admin_interventions', 'admin_handoffs',
];

export function isNavKey(value: unknown): value is NavKey {
  return typeof value === 'string' && (NAV_KEYS as readonly string[]).includes(value);
}
