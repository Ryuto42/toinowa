import 'server-only';
import { adminDb } from '@/lib/database/admin';
import type { Json } from '@/lib/database/types';
import { classroomOfStudent, raiseEscalation } from '@/lib/interventions/raise';
import { analyzeIntegrity } from './analyze';
import type { TypingSignals } from './ai-text';

interface RecordInput {
  tenantId: string;
  traceId: string;
  answerId: string;
  studentId: string;
  assignmentId: string;
  text: string;
  signals: TypingSignals;
}

/**
 * 回答1件のAI疑い・所要時間を判定して記録し、必要なら先生へ介入を上げる。
 *
 * チャットの返信を待たせないため after() から呼ぶ。
 * 失敗しても学習の本筋を止めない。
 */
export async function recordAnswerIntegrity(input: RecordInput): Promise<void> {
  try {
    const db = adminDb();
    const meta = await db.from('assignments')
      .select('classroom_id,classrooms(subject,grade)')
      .eq('tenant_id', input.tenantId).eq('id', input.assignmentId).maybeSingle();

    const result = await analyzeIntegrity({
      text: input.text,
      signals: input.signals,
      subject: meta.data?.classrooms?.subject ?? '',
      grade: meta.data?.classrooms?.grade ?? '',
      trace: { tenantId: input.tenantId, traceId: input.traceId, studentId: input.studentId },
    });

    await db.from('answers').update({
      ai_likelihood: result.aiLikelihood,
      ai_signals: {
        verdict: result.verdict,
        reasons: result.reasons,
        humanSignals: result.humanSignals,
        judged: result.judged,
        pace: { verdict: result.pace.verdict, ratio: result.pace.ratio, reason: result.pace.reason },
      } as unknown as Json,
    }).eq('tenant_id', input.tenantId).eq('id', input.answerId);

    if (result.verdict !== 'high') return;

    await raiseEscalation({
      tenantId: input.tenantId,
      studentId: input.studentId,
      classroomId: meta.data?.classroom_id ?? await classroomOfStudent(input.tenantId, input.studentId),
      kind: 'ai_suspected',
      priority: 'high',
      title: '生成AIで書かれた可能性のある説明が提出されました',
      payload: {
        answerId: input.answerId,
        assignmentId: input.assignmentId,
        likelihood: result.aiLikelihood,
        // 先生が自分で判断できるよう、疑う根拠と反証の両方を残す
        reasons: result.reasons,
        humanSignals: result.humanSignals,
        pace: result.pace.verdict,
        excerpt: input.text.slice(0, 200),
      },
      dedupeHours: 24,
    });
  } catch (error) {
    console.error('[integrity] 判定に失敗:', error);
  }
}
