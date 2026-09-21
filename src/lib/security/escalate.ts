import 'server-only';
import { recordGuardEvent } from './audit';
import { classroomOfStudent, raiseEscalation } from '@/lib/interventions/raise';
import type { SafetyBlocked } from '@/lib/orcarouter/errors';

const SOURCE_TITLES: Record<string, string> = {
  orca_guardrail: 'ゲートウェイのガードレールが入力を遮断しました',
  orca_firewall: 'ファイアウォールがツール実行を遮断しました',
  app_rule: '安全性チェックで入力を遮断しました',
  app_classifier: '安全性の判定により遮断しました',
};

/**
 * 遮断を1か所で記録する。
 *
 * 遮断して終わりにしない。生徒が困っている合図かもしれず、
 * 先生が気づけないまま消える種類の失敗にはしない。
 * 記録に失敗しても本処理は止めない（遮断自体はすでに成立している）。
 */
export function reportSafetyBlock(input: {
  error: SafetyBlocked;
  tenantId: string;
  studentId?: string | null;
  conversationId?: string | null;
  agentRunId?: string | null;
  /** 生徒以外の操作（授業準備など）では要フォローを立てず、記録だけ残す */
  escalate?: boolean;
}): void {
  const { error } = input;
  if (error.reported) return;
  error.reported = true;
  // 記録に失敗しても、遮断そのものは成立している。
  // ここで例外を投げると、本来返すべき SafetyBlocked が記録側の失敗に置き換わる。
  try {
    record(input);
  } catch (err) {
    console.error('[safety] 遮断の記録に失敗:', err);
  }
}

function record(input: {
  error: SafetyBlocked;
  tenantId: string;
  studentId?: string | null;
  conversationId?: string | null;
  agentRunId?: string | null;
  escalate?: boolean;
}): void {
  const { error, tenantId } = input;
  recordGuardEvent({
    tenantId,
    studentId: input.studentId ?? null,
    conversationId: input.conversationId ?? null,
    agentRunId: input.agentRunId ?? null,
    source: error.source,
    category: error.rule,
    rule: error.rule,
    blockedTools: error.blockedTools,
  });

  if (input.escalate === false) return;

  void (async () => {
    const studentId = input.studentId ?? null;
    await raiseEscalation({
      tenantId,
      studentId,
      classroomId: studentId ? await classroomOfStudent(tenantId, studentId) : null,
      kind: 'safety',
      priority: 'urgent',
      title: SOURCE_TITLES[error.source] ?? '安全性チェックで遮断しました',
      payload: { source: error.source, rule: error.rule, blockedTools: error.blockedTools },
      dedupeHours: 6,
    });
  })().catch((err: unknown) => console.error('[safety] 要フォローの起票に失敗:', err));
}
