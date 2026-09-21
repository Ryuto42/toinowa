import 'server-only';
import { adminDb } from '@/lib/database/admin';

export interface Colleague { id: string; display_name: string }

/**
 * 同じ所属の先生・管理者の名前だけを返す。
 *
 * `users` のRLSは、先生には「自分」と「担当している生徒」しか見せない。
 * 引き継ぎ先を選ぶには同僚の一覧が要るが、ここを許すために
 * RLSを緩めると、担当外の生徒まで読めてしまう。
 * 必要な列（IDと表示名）だけをサーバー側で取り、テナントで必ず絞る。
 */
export async function listColleagues(tenantId: string): Promise<Colleague[]> {
  const { data, error } = await adminDb()
    .from('users')
    .select('id,display_name')
    .eq('tenant_id', tenantId)
    .in('role', ['teacher', 'admin'])
    .eq('status', 'active')
    .order('display_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}
