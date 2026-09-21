import 'server-only';
import type { z } from 'zod';
import type { ModelClass } from './selection';
import type { RouterKey } from './routers';

/** どのエージェントからの呼び出しか。agent_runs.agent_name に入る。 */
export type AgentName =
  | 'orchestrator'
  | 'lesson-analysis'
  | 'learning-support'
  | 'assessment'
  | 'curriculum'
  | 'teacher-insight'
  | 'safety';

/** 1つのユーザー操作に紐づく実行をまとめる文脈 */
export interface TraceCtx {
  traceId: string;
  userId?: string | null;
  modelClass?: ModelClass;
  routingReason?: string;
  tenantId: string;
  studentId?: string | null;
  conversationId?: string | null;
  parentRunId?: string | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  tool_call_id?: string;
  name?: string;
}

/** 1回の試行の記録。ops画面のウォーターフォール表示に使う。 */
export interface AttemptRecord {
  attemptNo: number;
  model: string;
  outcome:
    | 'ok'
    | 'timeout'
    | 'error'
    | 'rate_limited'
    | 'schema_invalid'
    | 'blocked';
  latencyMs: number;
  errorCode?: string;
}

export interface CallMeta {
  runId: string;
  /** X-Orca-Resolved-Model。.withResponse() で読まないと永久に null になる */
  resolvedModel: string | null;
  /** X-Orca-Router */
  routerName: string | null;
  /** X-Orca-Request-Id。GET /v1/generation?id= で確定コストを引ける */
  orcaRequestId: string | null;
  inputTokens: number;
  /** 入力のうちプロンプトキャッシュから返った分。 */
  cachedInputTokens?: number;
  outputTokens: number;
  /** usage.cost_usd の実測値。取れなければ 0（null にはしない） */
  costUsd: number;
  /** 費用が応答に含まれず確認できなかった試行数 */
  unpricedAttempts?: number;
  latencyMs: number;
  /**
   * フォールバックが何段起きたか。
   * ⚠️ X-Orca-Fallback-Level は成功時に「そもそも返ってこない」（0 ではなく不在）。
   *    ヘッダの有無で判定すること。
   */
  fallbackCount: number;
  schemaValid: boolean;
  /** 全滅してルールベース応答に落ちたか */
  degraded: boolean;
  /** 無料枠・レート制限に当たったか。モデル障害とは区別する */
  rateLimited: boolean;
  attempts: AttemptRecord[];
  modelTier: 'dev' | 'production';
}

export interface CallResult<T> {
  data: T;
  meta: CallMeta;
}

export interface CallOptions<T extends z.ZodTypeAny | undefined = undefined> {
  router: RouterKey;
  modelClass?: ModelClass;
  agentName: AgentName;
  /** 何のための呼び出しか。agent_runs.request_type に入る */
  requestType: string;
  messages: ChatMessage[];
  /** 与えると構造化出力になる。Zodで検証し、失敗したら1回だけ修復を試みる */
  schema?: T;
  /**
   * 全滅したときのルールベース応答。
   * Learning Support / Assessment / Safety では **必須**。
   * これが無いと、モデル障害がそのまま利用者へのエラーになる。
   */
  degrade?: () => T extends z.ZodTypeAny ? z.infer<T> : string;
  /** 出力を公開・成功記録する前の検査。遮断時は再試行しない。 */
  validateOutput?: (output: T extends z.ZodTypeAny ? z.infer<T> : string) => void;
  maxOutputTokens?: number;
  temperature?: number;
  trace: TraceCtx;
}

/** OrcaRouter が返すエラーの形 */
export interface OrcaErrorBody {
  error?: {
    code?: string;
    message?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  };
}
