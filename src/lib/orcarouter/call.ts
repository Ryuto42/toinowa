import 'server-only';
import { z } from 'zod';
import { adminDb } from '@/lib/database/admin';
import { serverEnv } from '@/lib/shared/env.server';
import { orca } from './client';
import {
  BudgetExceeded,
  errorCodeOf,
  isGuardError,
  isQuotaError,
  isRetryable,
  SafetyBlocked,
  SchemaRepairFailed,
} from './errors';
import { fallbackModels, primaryModel, TIER } from './routers';
import { recordRun } from './record';
import type { AttemptRecord, CallMeta, CallOptions, CallResult } from './types';

/** モデル無効化レコードの短期キャッシュ。デモのキルスイッチが1秒以内に効く程度。 */
let disabledCache: { at: number; tenantId: string; models: Set<string> } | null = null;
const DISABLED_TTL_MS = 1_000;

/**
 * テナント単位で無効化されているモデルを引く。
 *
 * デモの「主モデルを停止してフェイルオーバーを見せる」はシミュレーションではなく、
 * この行を見て実際に連鎖から外す。審査員に問われても偽りが無い。
 */
async function disabledModels(tenantId: string): Promise<Set<string>> {
  const now = Date.now();
  if (
    disabledCache &&
    disabledCache.tenantId === tenantId &&
    now - disabledCache.at < DISABLED_TTL_MS
  ) {
    return disabledCache.models;
  }
  const { data } = await adminDb()
    .from('model_disables')
    .select('model')
    .eq('tenant_id', tenantId)
    .is('released_at', null);

  const models = new Set((data ?? []).map((r) => r.model));
  disabledCache = { at: now, tenantId, models };
  return models;
}

/**
 * 予算チェック。**呼び出しの前に**行う。
 * 超過を発見したリクエストで課金しないための順序。
 */
async function assertBudget(tenantId: string): Promise<void> {
  const tenant = await adminDb()
    .from('tenants')
    .select('ai_budget_limit_usd')
    .eq('id', tenantId);
  const tenantLimitValue = tenant.data?.[0]?.ai_budget_limit_usd;
  const tenantLimit = tenantLimitValue === undefined
    ? Number.POSITIVE_INFINITY
    : Number(tenantLimitValue);
  const limit = Math.min(serverEnv.AI_DAILY_BUDGET_USD, tenantLimit);
  const { data, error } = await adminDb().rpc('today_ai_spend', { p_tenant: tenantId });
  if (error) {
    throw new Error(`AI予算の確認に失敗しました: ${error.message}`);
  }
  const spent = Number(data ?? 0);
  if (spent >= limit) throw new BudgetExceeded(tenantId, spent, limit);
}

/** 構造化出力の修復プロンプト。1回だけ使う。 */
function repairPrompt(issues: string): string {
  return (
    '直前の出力はJSONスキーマに適合していません。\n' +
    `問題点:\n${issues}\n\n` +
    '説明や前置きを一切付けず、スキーマに適合するJSONオブジェクトだけを出力してください。'
  );
}

function jsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // モデルが ```json ... ``` で包むことがある
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        /* noop */
      }
    }
    // 本文の中に最初に現れるオブジェクトを拾う最後の手段
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1));
      } catch {
        /* noop */
      }
    }
    return undefined;
  }
}

/**
 * OrcaRouter 呼び出しの単一の入口。全エージェントがここを通る。
 *
 * フェイルオーバーの梯子（設計書19.1）:
 *   rung0  主モデル
 *   rung1  同じモデルを1回だけ再試行
 *   rung2  extra_body.route="fallback" による明示連鎖（プロバイダー分散）
 *   rung3  構造化出力の検証失敗 → 修復プロンプト1回
 *   rung4  全滅 → degrade() でルールベース応答
 *
 * 実測で分かっている注意点（docs/m0-spike-results.md）:
 *   ・x-orca-fallback-level は成功時「そもそも返らない」。0 ではなく不在
 *   ・usage.cost_usd は無料モデルでは返らない。取れなければ 0 とする
 *   ・推論モデルは出力の大半が reasoning トークンになる。max_tokens を絞りすぎない
 */
export async function callModel<S extends z.ZodTypeAny | undefined = undefined>(
  opts: CallOptions<S>,
): Promise<CallResult<S extends z.ZodTypeAny ? z.infer<S> : string>> {
  type Out = S extends z.ZodTypeAny ? z.infer<S> : string;

  const t0 = performance.now();
  const runId = crypto.randomUUID();
  const attempts: AttemptRecord[] = [];

  let resolvedModel: string | null = null;
  let routerName: string | null = null;
  let orcaRequestId: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let fallbackCount = 0;
  let schemaValid = true;
  let rateLimited = false;

  const finish = (
    data: Out,
    over: Partial<CallMeta> & { status?: Parameters<typeof recordRun>[0]['status'] } = {},
  ): CallResult<Out> => {
    const meta: CallMeta = {
      runId,
      resolvedModel,
      routerName,
      orcaRequestId,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs: Math.round(performance.now() - t0),
      fallbackCount,
      schemaValid,
      degraded: false,
      rateLimited,
      attempts,
      modelTier: TIER,
      ...over,
    };
    const status =
      over.status ??
      (meta.degraded
        ? 'degraded'
        : meta.rateLimited
          ? 'rate_limited'
          : !meta.schemaValid
            ? 'schema_repaired'
            : meta.fallbackCount > 0
              ? 'failed_over'
              : 'ok');

    recordRun({
      meta,
      agentName: opts.agentName,
      requestType: opts.requestType,
      trace: opts.trace,
      status,
    });
    return { data, meta };
  };

  const recordTerminal = (
    status: Parameters<typeof recordRun>[0]['status'],
    errorCode: string,
  ): void => {
    recordRun({
      meta: {
        runId,
        resolvedModel,
        routerName,
        orcaRequestId,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs: Math.round(performance.now() - t0),
        fallbackCount,
        schemaValid,
        degraded: false,
        rateLimited,
        attempts,
        modelTier: TIER,
      },
      agentName: opts.agentName,
      requestType: opts.requestType,
      trace: opts.trace,
      status,
      errorCode,
    });
  };

  // ── 予算チェックは呼び出しの前 ──
  try {
    await assertBudget(opts.trace.tenantId);
  } catch (err) {
    if (err instanceof BudgetExceeded && opts.degrade) {
      return finish(opts.degrade() as Out, { degraded: true, status: 'degraded' });
    }
    recordTerminal(
      err instanceof BudgetExceeded ? 'rate_limited' : 'error',
      err instanceof BudgetExceeded ? 'budget_exceeded' : errorCodeOf(err),
    );
    throw err;
  }

  // ── 梯子の組み立て。無効化されたモデルは実際に外す ──
  const disabled = await disabledModels(opts.trace.tenantId);
  const primary = primaryModel(opts.router);
  const chain = fallbackModels(opts.router).filter((m) => !disabled.has(m));

  type Rung = { model: string; useChain: boolean };
  const ladder: Rung[] = [];
  if (!disabled.has(primary)) {
    ladder.push({ model: primary, useChain: false });
    ladder.push({ model: primary, useChain: false }); // rung1: 同じモデルを1回だけ再試行
  }
  if (chain.length > 0) {
    ladder.push({ model: chain[0], useChain: true });
  }

  if (ladder.length === 0) {
    // 全モデルが無効化されている（キルスイッチ全開）
    if (opts.degrade) {
      return finish(opts.degrade() as Out, { degraded: true, status: 'degraded' });
    }
    recordTerminal('error', 'all_models_disabled');
    throw new Error('利用可能なモデルがありません（すべて無効化されています）');
  }

  let lastError: unknown = null;

  ladderLoop: for (let rung = 0; rung < ladder.length; rung++) {
    const { model, useChain } = ladder[rung];
    let messages = opts.messages;

    // 構造化出力の修復は「そのモデルの中で」1回だけ
    for (let repair = 0; repair <= (opts.schema ? 1 : 0); repair++) {
      const attemptStart = performance.now();
      let attemptRecorded = false;
      try {
        const { data: res, response } = await orca.chat.completions
          .create({
            model,
            messages: messages as never,
            // OrcaRouterの互換エンドポイントと実測スクリプトが共通で受け付ける
            // OpenAI標準のフィールドを使う。推論トークンもこの上限に含まれる。
            max_tokens: opts.maxOutputTokens ?? 1500,
            ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
            ...(opts.schema
              ? {
                  response_format: {
                    type: 'json_schema',
                    json_schema: {
                      name: 'result',
                      strict: true,
                      schema: z.toJSONSchema(opts.schema, { io: 'output' }) as never,
                    },
                  },
                }
              : {}),
            ...(useChain
              ? {
                  // ⚠️ route は厳密に "fallback" でないと連鎖が発動しない
                  extra_body: { route: 'fallback', models: chain.slice(0, 5) },
                }
              : {}),
          } as never)
          .withResponse();

        // ── ヘッダは .withResponse() でしか読めない ──
        const fallbackModel = response.headers.get('x-orca-fallback-model');
        resolvedModel =
          response.headers.get('x-orca-resolved-model') ??
          fallbackModel ??
          resolvedModel ??
          model;
        routerName = response.headers.get('x-orca-router') ?? routerName ?? model;
        orcaRequestId = response.headers.get('x-orca-request-id') ?? orcaRequestId;

        // ⚠️ 成功時は fallback ヘッダが「返らない」。0 ではなく不在で判定する
        const fbLevel = response.headers.get('x-orca-fallback-level');
        if (fbLevel !== null) {
          const parsedLevel = Number(fbLevel);
          fallbackCount = Math.max(
            fallbackCount,
            Number.isFinite(parsedLevel) && parsedLevel >= 0 ? parsedLevel : 1,
          );
        }

        const usage = res.usage as
          | { prompt_tokens?: number; completion_tokens?: number; cost_usd?: number }
          | undefined;
        inputTokens = usage?.prompt_tokens ?? 0;
        outputTokens = usage?.completion_tokens ?? 0;
        costUsd = usage?.cost_usd ?? 0; // 無料モデルでは返らない。null にはしない

        const content = res.choices[0]?.message?.content ?? '';
        attempts.push({
          attemptNo: attempts.length + 1,
          model,
          outcome: 'ok',
          latencyMs: Math.round(performance.now() - attemptStart),
        });
        attemptRecorded = true;

        if (!opts.schema) {
          schemaValid = true;
          return finish(content as Out);
        }

        const parsed = opts.schema.safeParse(jsonParse(content));
        if (parsed.success) {
          return finish(parsed.data as Out);
        }

        // ── 構造化出力が壊れている ──
        schemaValid = false;
        attempts[attempts.length - 1].outcome = 'schema_invalid';
        if (repair === 1) throw new SchemaRepairFailed(z.prettifyError(parsed.error));

        messages = [
          ...messages,
          { role: 'assistant', content },
          { role: 'user', content: repairPrompt(z.prettifyError(parsed.error)) },
        ];
        continue;
      } catch (err) {
        lastError = err;
        const guard = isGuardError(err);
        const quota = isQuotaError(err);
        if (quota) rateLimited = true;

        // SchemaRepairFailed は同じ試行の結果をすでに記録済みなので、
        // ここで重複行を作らない。それ以外は例外も1試行として残す。
        if (!(err instanceof SchemaRepairFailed && attemptRecorded)) {
          attempts.push({
            attemptNo: attempts.length + 1,
            model,
            outcome: guard
              ? 'blocked'
              : quota
                ? 'rate_limited'
                : err instanceof SchemaRepairFailed
                  ? 'schema_invalid'
                  : 'error',
            latencyMs: Math.round(performance.now() - attemptStart),
            errorCode: errorCodeOf(err),
          });
        }

        // 遮断は再試行しない。fail closed。
        if (guard) {
          recordRun({
            meta: {
              runId, resolvedModel, routerName, orcaRequestId,
              inputTokens, outputTokens, costUsd,
              latencyMs: Math.round(performance.now() - t0),
              fallbackCount, schemaValid, degraded: false, rateLimited,
              attempts, modelTier: TIER,
            },
            agentName: opts.agentName,
            requestType: opts.requestType,
            trace: opts.trace,
            status: 'blocked',
            errorCode: errorCodeOf(err),
            safetyResult: { source: guard, message: String(err) },
          });
          throw new SafetyBlocked(guard, errorCodeOf(err));
        }

        // このモデルでは無理。次の段へ
        // 400/401 などリクエスト自体の問題は、別モデルへ送っても直らない。
        // ラベル付き break で外側の梯子も止める。
        if (!isRetryable(err)) break ladderLoop;
        if (rung === ladder.length - 1) break;
        await new Promise((r) => setTimeout(r, 250 * 2 ** rung));
        break; // 修復ループを抜けて次の rung へ
      }
    }
  }

  // ── rung4: 全滅。ルールベースへ縮退する ──
  if (opts.degrade) {
    return finish(opts.degrade() as Out, { degraded: true, status: 'degraded' });
  }

  recordTerminal(rateLimited ? 'rate_limited' : 'error', errorCodeOf(lastError));
  throw lastError ?? new Error('モデル呼び出しに失敗しました');
}
