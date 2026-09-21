import 'server-only';
import { detectAiText, verdictOf, type AiVerdict, type TypingSignals } from './ai-text';
import { aiJudgeAgent } from './ai-judge';
import { evaluatePace, type PaceResult } from './pace';

export interface IntegrityInput {
  text: string;
  signals: TypingSignals;
  subject?: string;
  grade?: string;
  trace: { tenantId: string; traceId: string; studentId?: string | null; userId?: string | null };
}

export interface IntegrityResult {
  aiLikelihood: number;
  verdict: AiVerdict;
  /** 先生に見せる根拠の箇条書き */
  reasons: string[];
  /** 本人が書いたと思われる特徴 */
  humanSignals: string[];
  pace: PaceResult;
  /** LLM判定まで行ったか（コスト観測用） */
  judged: boolean;
}

/**
 * 回答1件について、AI生成の疑いと所要時間の妥当性をまとめて評価する。
 *
 * ヒューリスティックで白黒はっきりしているものはLLMを呼ばない。
 * 灰色（0.35〜0.75）のときだけ判定を依頼し、両者の平均を最終値にする。
 */
export async function analyzeIntegrity(input: IntegrityInput): Promise<IntegrityResult> {
  const heuristic = detectAiText(input.text, input.signals);
  const pace = evaluatePace(input.text.length, input.signals.elapsedSec ?? null);

  let likelihood = heuristic.score;
  let reasons = heuristic.signals.map((s) => s.note);
  let humanSignals: string[] = [];
  let judged = false;

  if (heuristic.needsJudge) {
    try {
      const result = await aiJudgeAgent.run(
        { text: input.text, subject: input.subject ?? '', grade: input.grade ?? '' },
        {
          tenantId: input.trace.tenantId,
          traceId: input.trace.traceId,
          studentId: input.trace.studentId ?? undefined,
          userId: input.trace.userId ?? null,
        },
      );
      if (!result.meta.degraded) {
        judged = true;
        // 機械的な指標とLLMの読みを同じ重みで混ぜる。
        // どちらか一方だけで断定させない。
        likelihood = (heuristic.score + result.data.likelihood) / 2;
        reasons = [...reasons, ...result.data.reasons];
        humanSignals = result.data.humanSignals;
      }
    } catch {
      // 判定に失敗してもヒューリスティックの値をそのまま使う。
      // 判定できないことを理由に生徒を疑わない。
    }
  }

  // 速すぎる回答はAIの疑いを少しだけ押し上げる（単独では決め手にしない）
  if (pace.verdict === 'too_fast') likelihood = Math.min(1, likelihood + 0.1);

  return {
    aiLikelihood: Number(likelihood.toFixed(3)),
    verdict: verdictOf(likelihood),
    reasons,
    humanSignals,
    pace,
    judged,
  };
}
