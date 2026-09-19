import 'server-only';
import { adminDb } from '@/lib/database/admin';
import type { AgentRunStatus } from '@/lib/database/types';
import type { AgentName, CallMeta, TraceCtx } from './types';

/**
 * agent_runs / agent_run_attempts への記録。
 *
 * **成功・縮退・遮断・エラーのすべての経路で必ず書く。**
 * 失敗した呼び出しこそ運用画面で見たいものなので、
 * 「エラー時は記録をスキップ」は絶対にやらない。
 *
 * ただし記録はユーザー体験の遅延に足さない。`after()` があればそれに載せ、
 * 無ければ浮いた Promise にする（記録の失敗でリクエストを壊さない）。
 */
export interface RunRecord {
  meta: CallMeta;
  agentName: AgentName;
  requestType: string;
  trace: TraceCtx;
  status: AgentRunStatus;
  errorCode?: string | null;
  safetyResult?: Record<string, unknown>;
  toolCalls?: unknown[];
}

async function write(rec: RunRecord): Promise<void> {
  const db = adminDb();
  const { meta, trace } = rec;

  const { error } = await db.from('agent_runs').insert({
    id: meta.runId,
    tenant_id: trace.tenantId,
    trace_id: trace.traceId,
    parent_run_id: trace.parentRunId ?? null,
    agent_name: rec.agentName,
    request_type: rec.requestType,
    model_tier: meta.modelTier,
    router_name: meta.routerName ?? 'unknown',
    resolved_model: meta.resolvedModel,
    orca_request_id: meta.orcaRequestId,
    input_tokens: meta.inputTokens,
    output_tokens: meta.outputTokens,
    estimated_cost_usd: meta.costUsd,
    latency_ms: meta.latencyMs,
    fallback_count: meta.fallbackCount,
    schema_valid: meta.schemaValid,
    safety_result: (rec.safetyResult ?? {}) as never,
    tool_calls: (rec.toolCalls ?? []) as never,
    status: rec.status,
    error_code: rec.errorCode ?? null,
    student_id: trace.studentId ?? null,
    conversation_id: trace.conversationId ?? null,
  });
  if (error) {
    console.error('[agent_runs] 記録に失敗:', error.message);
    return;
  }

  if (meta.attempts.length > 0) {
    await db.from('agent_run_attempts').insert(
      meta.attempts.map((a) => ({
        agent_run_id: meta.runId,
        attempt_no: a.attemptNo,
        model: a.model,
        outcome: a.outcome,
        latency_ms: a.latencyMs,
        error_code: a.errorCode ?? null,
      })),
    );
  }

  // 予算台帳。free枠でも件数は積むので、無料枠の消費が見える。
  await db.rpc('bump_ai_budget', {
    p_tenant: trace.tenantId,
    p_scope: 'tenant',
    p_scope_id: trace.tenantId,
    p_cost: meta.costUsd,
  });
  if (trace.studentId) {
    await db.rpc('bump_ai_budget', {
      p_tenant: trace.tenantId,
      p_scope: 'student',
      p_scope_id: trace.studentId,
      p_cost: meta.costUsd,
    });
  }
}

export function recordRun(rec: RunRecord): void {
  const task = write(rec).catch((e) => {
    // 記録の失敗でリクエスト本体を壊さない
    console.error('[agent_runs] 記録で例外:', e);
  });

  // リクエスト文脈にいれば after() に載せてレスポンスを待たせない。
  // スクリプトやテストからの呼び出しでは after() が使えないので浮かせる。
  void (async () => {
    try {
      const { after } = await import('next/server');
      // `after` expects a callback. Passing the promise itself can be
      // accepted by TypeScript through the dynamic import but fails at runtime.
      after(() => task);
    } catch {
      void task;
    }
  })();
}
