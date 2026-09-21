import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { nextReview, type ReviewState } from './review-schedule';

export { nextReview };
export type { ReviewState };

/** 評価が確定したら、その概念の次回復習を積む。 */
export async function scheduleReview(input: {
  tenantId: string; studentId: string; conceptId: string; assessmentId: string; score: number | null;
}): Promise<void> {
  if (input.score === null) return;
  const db = adminDb();
  const existing = await db.from('review_schedules')
    .select('id,interval_days,ease,repetition')
    .eq('tenant_id', input.tenantId).eq('student_id', input.studentId).eq('concept_id', input.conceptId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const next = nextReview(input.score, existing.data
    ? { intervalDays: existing.data.interval_days, ease: Number(existing.data.ease), repetition: existing.data.repetition }
    : null);
  const dueAt = new Date(Date.now() + next.intervalDays * 86_400_000).toISOString();

  const { error } = await db.from('review_schedules').upsert({
    tenant_id: input.tenantId,
    student_id: input.studentId,
    concept_id: input.conceptId,
    due_at: dueAt,
    interval_days: next.intervalDays,
    ease: next.ease,
    repetition: next.repetition,
    last_assessment_id: input.assessmentId,
    fulfilled_at: null,
  }, { onConflict: 'student_id,concept_id' });
  if (error) throw new Error(error.message);
}
