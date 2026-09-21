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
import { modelsForClass } from './selection';
import { reportSafetyBlock } from '@/lib/security/escalate';
import { estimateCostUsd } from './pricing';
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
  const { data, error } = await adminDb()
    .from('model_disables')
    .select('model')
    .eq('tenant_id', tenantId)
    .is('released_at', null);

  if (error) throw new Error('AIモデルの停止設定を確認できませんでした');
  const models = new Set((data ?? []).map((r) => r.model));
  disabledCache = { at: now, tenantId, models };
  return models;
}

/**
 * 予算チェック。**呼び出しの前に**行う。
 * 超過を発見したリクエストで課金しないための順序。
 */
async function assertBudget(tenantId: string, accruedCost = 0, studentId?: string | null): Promise<void> {
  const tenant = await adminDb().from('tenants').select('ai_budget_limit_usd').eq('id', tenantId);
  const rawLimit = tenant.data?.[0]?.ai_budget_limit_usd;
  const tenantLimit = Number(rawLimit);
  if (tenant.error || rawLimit == null || !Number.isFinite(tenantLimit) || tenantLimit < 0) {
    throw new Error('AI予算の設定を確認できませんでした');
  }
  const limit = Math.min(serverEnv.AI_DAILY_BUDGET_USD, tenantLimit);
  const { data, error } = await adminDb().rpc('today_ai_spend', { p_tenant: tenantId });
  const spent = Number(data);
  if (error || data == null || !Number.isFinite(spent) || spent < 0) {
    throw new Error('AI利用額を確認できませんでした');
  }
  if (spent + accruedCost >= limit) throw new BudgetExceeded(tenantId, spent + accruedCost, limit);

  // 生徒単位の上限。テナント枠だけだと、1人の連投で学校全体が止まる。
  if (!studentId) return;
  const perStudent = await adminDb().rpc('today_student_ai_spend', { p_tenant: tenantId, p_student: studentId });
  const used = Number(perStudent.data);
  if (perStudent.error || perStudent.data == null || !Number.isFinite(used) || used < 0) {
    throw new Error('AI利用額を確認できませんでした');
  }
  const studentLimit = Math.min(serverEnv.AI_STUDENT_DAILY_BUDGET_USD, limit);
  if (used + accruedCost >= studentLimit) throw new BudgetExceeded(tenantId, used + accruedCost, studentLimit);
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
  let cachedInputTokens = 0;
  let audioInputTokens = 0;
  let costUsd = 0;
  let fallbackCount = 0;
  let schemaValid = true;
  let rateLimited = false;
  let unpricedAttempts = 0;
  let estimatedAttempts = 0;

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
      cachedInputTokens,
      audioInputTokens,
      estimatedAttempts,
      costUsd,
      latencyMs: Math.round(performance.now() - t0),
      fallbackCount,
      schemaValid,
      degraded: false,
      rateLimited,
      attempts,
      unpricedAttempts,
      modelTier: TIER,
      ...over,
    };
    const status =
      over.status ??
      (meta.degraded
        ? 'degraded'
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
        cachedInputTokens,
        audioInputTokens,
        estimatedAttempts,
        costUsd,
        latencyMs: Math.round(performance.now() - t0),
        fallbackCount,
        schemaValid,
        degraded: false,
        rateLimited,
        attempts,
        unpricedAttempts,
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
    await assertBudget(opts.trace.tenantId, 0, opts.trace.studentId);
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
  let disabled: Set<string>;
  try { disabled = await disabledModels(opts.trace.tenantId); } catch (error) {
    recordTerminal('error', 'model_policy_unavailable');
    throw error;
  }
  const selected = opts.modelClass ? modelsForClass(opts.modelClass, serverEnv) : null;
  const primary = selected?.[0] ?? primaryModel(opts.router);
  const chain = (selected ?? fallbackModels(opts.router)).filter((m) => !disabled.has(m));

  type Rung = { model: string; useChain: boolean };
  const ladder: Rung[] = [];
  if (!disabled.has(primary)) {
    ladder.push({ model: primary, useChain: false });
    if (!selected) ladder.push({ model: primary, useChain: false });
  }
  if (selected) {
    // 用途別ルーティングは遅いautoを再び呼ばず、別モデルへ直接切り替える。
    for (const model of chain.filter(model => model !== primary)) ladder.push({ model, useChain: false });
  } else if (chain.length > 0) {
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
    if (rung > 0 && model !== ladder[rung - 1].model) fallbackCount += 1;
    let messages = opts.messages;

    // 構造化出力の修復は「そのモデルの中で」1回だけ
    for (let repair = 0; repair <= (opts.schema ? 1 : 0); repair++) {
      if (attempts.length) {
        try { await assertBudget(opts.trace.tenantId, costUsd, opts.trace.studentId); } catch (error) {
          if (error instanceof BudgetExceeded && opts.degrade) return finish(opts.degrade() as Out, { degraded: true });
          recordTerminal(error instanceof BudgetExceeded ? 'rate_limited' : 'error', errorCodeOf(error));
          throw error;
        }
      }
      const remainingMs = 45_000 - (performance.now() - t0);
      if (remainingMs <= 0) { lastError = new Error('AI request deadline exceeded'); break ladderLoop; }
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
          } as never, { timeout: Math.min(15_000, Math.ceil(remainingMs)) })
          .withResponse();

        // ── ヘッダは .withResponse() でしか読めない ──
        const fallbackModel = response.headers.get('x-orca-fallback-model');
        resolvedModel =
          response.headers.get('x-orca-resolved-model') ??
          fallbackModel ??
          res.model ??
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
          | { prompt_tokens?: number; completion_tokens?: number; cost_usd?: number;
              prompt_tokens_details?: { cached_tokens?: number; audio_tokens?: number } }
          | undefined;
        // スキーマ修復や別モデルでの再生成にも課金されるため、取得できた全応答を合算する。
        inputTokens += usage?.prompt_tokens ?? 0;
        outputTokens += usage?.completion_tokens ?? 0;
        // 入力のうちキャッシュから返った分。並べ方の効果を後から測るために残す。
        cachedInputTokens += usage?.prompt_tokens_details?.cached_tokens ?? 0;
        const attemptAudioTokens = usage?.prompt_tokens_details?.audio_tokens ?? 0;
        audioInputTokens += attemptAudioTokens;
        const observedCost = usage?.cost_usd;
        if (typeof observedCost === 'number' && Number.isFinite(observedCost) && observedCost >= 0) {
          costUsd += observedCost;
        } else {
          // 音声を含む応答には cost_usd が付かない（実測）。
          // 0 のままにすると、表示に出ないだけでなく予算のガードが素通りする。
          const guess = await estimateCostUsd({
            model: resolvedModel ?? model,
            inputTokens: usage?.prompt_tokens ?? 0,
            outputTokens: usage?.completion_tokens ?? 0,
            audioInputTokens: attemptAudioTokens,
          });
          if (guess === null) unpricedAttempts += 1;
          else { costUsd += guess; estimatedAttempts += 1; }
        }

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
          opts.validateOutput?.(content as Out);
          return finish(content as Out);
        }

        const parsed = opts.schema.safeParse(jsonParse(content));
        if (parsed.success) {
          opts.validateOutput?.(parsed.data as Out);
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
        const guard = err instanceof SafetyBlocked ? err.source : isGuardError(err);
        const quota = isQuotaError(err);
        if (quota) rateLimited = true;

        // SchemaRepairFailed は同じ試行の結果をすでに記録済みなので、
        // ここで重複行を作らない。それ以外は例外も1試行として残す。
        if (attemptRecorded && guard) attempts[attempts.length - 1].outcome = 'blocked';
        if (!attemptRecorded) {
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
              inputTokens, outputTokens, cachedInputTokens, audioInputTokens, costUsd,
              latencyMs: Math.round(performance.now() - t0),
              fallbackCount, schemaValid, degraded: false, rateLimited,
              attempts, unpricedAttempts, estimatedAttempts, modelTier: TIER,
            },
            agentName: opts.agentName,
            requestType: opts.requestType,
            trace: opts.trace,
            status: 'blocked',
            errorCode: errorCodeOf(err),
            safetyResult: { source: guard, ...(err instanceof SafetyBlocked ? { rule: err.rule } : {}) },
          });
          const blocked = err instanceof SafetyBlocked ? err : new SafetyBlocked(guard, errorCodeOf(err));
          // ここを通るのはゲートウェイのガードレールと自前判定の両方。
          // 記録と要フォローの起票を1か所に寄せ、経路ごとの取りこぼしを無くす。
          reportSafetyBlock({
            error: blocked,
            tenantId: opts.trace.tenantId,
            studentId: opts.trace.studentId,
            conversationId: opts.trace.conversationId,
            agentRunId: runId,
          });
          throw blocked;
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
