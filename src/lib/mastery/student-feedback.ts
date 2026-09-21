import 'server-only';
import type { AuthContext } from '@/lib/auth/types';
import { ForbiddenError } from '@/lib/auth/errors';
import { adminDb } from '@/lib/database/admin';
import { simplifyFeedback } from './feedback';

export async function studentFeedback(context: AuthContext, conversationId?: string) {
  if (context.role !== 'student') throw new ForbiddenError();
  const db = adminDb();
  let query = db.from('conversations').select('id').eq('tenant_id', context.tenantId)
    .eq('student_id', context.userId).eq('state', 'completed');
  if (conversationId) query = query.eq('id', conversationId);
  const conversations = await query.order('completed_at', { ascending: false }).limit(100);
  if (conversations.error) throw new Error(conversations.error.message);
  const ids = (conversations.data ?? []).map(row => row.id);
  if (!ids.length) return [];
  const result = await db.from('assessments')
    .select('id,conversation_id,is_final,component_scores,reviewer_status,created_at,concepts(name)')
    .eq('tenant_id', context.tenantId).eq('student_id', context.userId).eq('is_final', true)
    .in('conversation_id', ids).order('created_at', { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).flatMap(row => {
    const feedback = simplifyFeedback(row, row.concepts?.name ?? '課題', true);
    return feedback ? [feedback] : [];
  });
}
