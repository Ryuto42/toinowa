import 'server-only';
import { createClient } from '@/lib/database/server';
import type { AuthContext } from '@/lib/auth/types';

/** 担当・在籍確認後に呼ぶ。選択したクラスの完了済み対話だけを参照する。 */
export async function topicStudentContext(context: AuthContext, studentId: string, classroomId: string) {
  const db = await createClient();
  const [profile, conversations] = await Promise.all([
    db.from('student_profiles').select('grade,learning_goal,weak_areas,exam_results').eq('tenant_id', context.tenantId).eq('user_id', studentId).maybeSingle(),
    db.from('conversations').select('id,completed_at,lessons!inner(classroom_id)').eq('tenant_id', context.tenantId).eq('student_id', studentId).eq('state', 'completed').eq('lessons.classroom_id', classroomId).order('completed_at', { ascending: false }).limit(3),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  if (conversations.error) throw new Error(conversations.error.message);
  const ids = conversations.data.map(row => row.id);
  const [messages, assessments] = ids.length ? await Promise.all([
    db.from('messages').select('conversation_id,actor,content_redacted,seq').eq('tenant_id', context.tenantId).in('conversation_id', ids).order('created_at', { ascending: false }).limit(36),
    db.from('assessments').select('score,override_score,override_note,reviewer_status,difficulty_at_time,difficulty_reason,concepts(name)').eq('tenant_id', context.tenantId).eq('student_id', studentId).eq('is_final', true).neq('reviewer_status', 'rejected').in('conversation_id', ids).order('created_at', { ascending: false }).limit(3),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (messages.error) throw new Error(messages.error.message);
  if (assessments.error) throw new Error(assessments.error.message);
  const history = {
    grade: profile.data?.grade,
    goal: profile.data?.learning_goal?.slice(0, 600),
    examResults: profile.data?.exam_results?.slice(0, 2500),
    weakAreas: profile.data?.weak_areas?.slice(0, 800),
    conversations: ids.map(id => ({ messages: (messages.data ?? []).filter(row => row.conversation_id === id).sort((a, b) => a.seq - b.seq).slice(0, 8).map(row => ({ speaker: row.actor, text: row.content_redacted.slice(0, 400) })) })),
    feedback: (assessments.data ?? []).map(row => ({ concept: row.concepts?.name?.slice(0, 200), score: row.override_score ?? row.score, teacherCorrection: row.override_note?.slice(0, 500), status: row.reviewer_status, difficulty: row.difficulty_at_time, analysis: row.difficulty_reason?.slice(0, 1000) })),
  };
  return { text: JSON.stringify(history), conversationsUsed: ids.length, feedbackUsed: assessments.data?.length ?? 0 };
}
