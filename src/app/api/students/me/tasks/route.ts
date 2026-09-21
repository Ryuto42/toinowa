import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { json, routeError } from '@/lib/api/http';

export async function GET() {
  try {
    const context = await requireRole('student');
    const db = await createClient();
    const { data, error } = await db.from('assignments').select('id,lesson_id,question_ids,status,due_at,published_at,lessons(title)')
      .eq('tenant_id', context.tenantId)
      .in('status', ['published', 'completed']).order('due_at', { ascending: true });
    if (error) throw new Error(error.message);
    // RLSが個別配信と所属クラスへの配信を絞る。配列IDはリレーションではないため明示取得。
    const ids = [...new Set((data ?? []).flatMap(task => task.question_ids))];
    const questions = ids.length ? await db.from('questions').select('id,body,format,difficulty,concept_id').eq('tenant_id', context.tenantId).in('id', ids) : { data: [], error: null };
    if (questions.error) throw new Error(questions.error.message);
    const byId = new Map((questions.data ?? []).map(question => [question.id, question]));
    return json({ tasks: (data ?? []).map(task => ({ ...task, questions: task.question_ids.flatMap(id => byId.has(id) ? [byId.get(id)] : []) })) });
  } catch (error) {
    return routeError(error);
  }
}
