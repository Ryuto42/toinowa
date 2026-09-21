import type { OrcaErrorBody } from './types';

/** 予算超過。呼び出し「前」に投げる（超過を発見したリクエストで課金しないため） */
export class BudgetExceeded extends Error {
  constructor(
    readonly tenantId: string,
    readonly spentUsd: number,
    readonly limitUsd: number,
  ) {
    super(
      `本日のAI費用が上限に達しました（${spentUsd.toFixed(4)} / ${limitUsd.toFixed(2)} USD）`,
    );
    this.name = 'BudgetExceeded';
  }
}

/** 構造化出力が修復1回でも直らなかった */
export class SchemaRepairFailed extends Error {
  constructor(readonly detail: string) {
    super(`構造化出力の検証に失敗しました: ${detail}`);
    this.name = 'SchemaRepairFailed';
  }
}

/** Guardrails / Firewall / 自前Safety層による遮断 */
export class SafetyBlocked extends Error {
  /** 記録と要フォローの起票が済んだか。経路が重なっても二重に残さないための印。 */
  reported = false;

  constructor(
    readonly source: 'orca_guardrail' | 'orca_firewall' | 'app_rule' | 'app_classifier',
    readonly rule: string,
    readonly blockedTools: string[] = [],
  ) {
    super(`安全性チェックにより遮断されました (${source}: ${rule})`);
    this.name = 'SafetyBlocked';
  }
}

/**
 * OrcaRouter は `{ error: { code, ... } }` を返すが、OpenAI SDK はそれを
 * APIError.error に展開して保持する。両方の形を同じように扱う。
 */
function bodyOf(err: unknown): OrcaErrorBody['error'] | null {
  if (typeof err !== 'object' || err === null) return null;
  const value = err as {
    error?: unknown;
    code?: unknown;
    type?: unknown;
    metadata?: unknown;
    response?: { data?: unknown };
  };

  const direct = value.error;
  if (direct && typeof direct === 'object') {
    const nested = (direct as { error?: unknown }).error;
    if (nested && typeof nested === 'object') {
      return nested as OrcaErrorBody['error'];
    }
    return direct as OrcaErrorBody['error'];
  }

  const responseData = value.response?.data;
  if (responseData && typeof responseData === 'object') {
    const nested = (responseData as { error?: unknown }).error;
    if (nested && typeof nested === 'object') {
      return nested as OrcaErrorBody['error'];
    }
  }

  if (typeof value.code === 'string' || typeof value.type === 'string') {
    return {
      code: typeof value.code === 'string' ? value.code : undefined,
      type: typeof value.type === 'string' ? value.type : undefined,
      metadata:
        value.metadata && typeof value.metadata === 'object'
          ? (value.metadata as Record<string, unknown>)
          : undefined,
    };
  }
  return null;
}

function statusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const value = err as { status?: unknown; response?: { status?: unknown } };
  const s = value.status ?? value.response?.status;
  return typeof s === 'number' ? s : null;
}

export function errorCodeOf(err: unknown): string {
  const body = bodyOf(err);
  if (body?.code) return body.code;
  if (body?.type) return body.type;
  const status = statusOf(err);
  if (status) return `http_${status}`;
  if (err instanceof Error) return err.name;
  return 'unknown';
}

/**
 * 無料枠・レート制限に当たったか。
 *
 * これを「モデル障害」と混ぜないことが重要。
 * 運用画面でフォールバック件数に混ぜると、実際には健全なのに
 * モデルが壊れているように見えてしまう。
 */
export function isQuotaError(err: unknown): boolean {
  const code = errorCodeOf(err);
  const status = statusOf(err);
  return (
    status === 402 ||
    status === 429 ||
    code === 'free_quota_exhausted' ||
    code === 'insufficient_quota' ||
    code === 'free_rate_limited' ||
    code === 'rate_limit_exceeded'
  );
}

/** Guardrails / Firewall による遮断か */
export function isGuardError(err: unknown): 'orca_guardrail' | 'orca_firewall' | null {
  const code = errorCodeOf(err);
  if (code === 'guardrail_blocked') return 'orca_guardrail';
  if (code === 'firewall_blocked') return 'orca_firewall';
  return null;
}

/**
 * 次のモデルへ移ってよいエラーか。
 *
 * 4xx のうち 408/409/429 以外は、モデルを変えても同じ結果になる
 * （リクエストが悪い）ので、梯子を降りずに即座に失敗させる。
 * 無駄な課金と遅延を増やさないため。
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof SafetyBlocked || err instanceof BudgetExceeded || isGuardError(err)) return false; // 遮断は再試行しない
  if (isQuotaError(err)) return true; // 別モデルなら通る可能性がある
  const status = statusOf(err);
  if (status === null) return true; // ネットワーク・タイムアウト
  if (status >= 500) return true;
  return status === 408 || status === 409;
}
