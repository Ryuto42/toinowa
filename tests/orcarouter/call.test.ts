import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => {
  const query = {
    data: [{ ai_budget_limit_usd: 1 }] as unknown[],
    error: null as unknown,
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
  };
  return {
    create: vi.fn(),
    recordRun: vi.fn(),
    adminDb: vi.fn(() => ({
      from: vi.fn(() => query),
      rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
    })),
    query,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/shared/env.server', () => ({
  serverEnv: { AI_DAILY_BUDGET_USD: 1 },
}));
vi.mock('@/lib/database/admin', () => ({ adminDb: mocks.adminDb }));
vi.mock('@/lib/orcarouter/client', () => ({
  orca: { chat: { completions: { create: mocks.create } } },
}));
vi.mock('@/lib/orcarouter/record', () => ({ recordRun: mocks.recordRun }));
vi.mock('@/lib/orcarouter/routers', () => ({
  TIER: 'dev',
  primaryModel: () => 'model/primary',
  fallbackModels: () => ['model/primary', 'model/fallback'],
}));

import { SafetyBlocked } from '@/lib/orcarouter/errors';
import { callModel } from '@/lib/orcarouter/call';

const trace = {
  traceId: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000002',
};

function okResponse(content: string, headers: Record<string, string> = {}) {
  return {
    data: {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 3, completion_tokens: 5, cost_usd: 0.001 },
    },
    response: { headers: new Headers(headers) },
  };
}

function queuedResponse(value: unknown) {
  return { withResponse: vi.fn().mockResolvedValue(value) };
}

describe('callModel', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.recordRun.mockReset();
    mocks.query.data = [{ ai_budget_limit_usd: 1 }];
    mocks.query.error = null;
    trace.tenantId = crypto.randomUUID();
  });

  it('自己紹介のeconomy指定はFlash Liteを優先する', async () => {
    mocks.create.mockReturnValueOnce(queuedResponse(okResponse('hello')));
    await callModel({ router: 'studentChat', modelClass: 'economy', agentName: 'learning-support', requestType: 'student_tutorial', messages: [{ role: 'user', content: 'test' }], trace });
    expect(mocks.create.mock.calls[0][0].model).toBe('google/gemini-2.5-flash-lite');
  });

  it('模試だけ60秒待ち、失敗時はジョブに返して別モデルに切り替えない', async () => {
    mocks.create.mockReturnValueOnce({ withResponse: vi.fn().mockRejectedValue({ status:504 }) });
    await expect(callModel({ router:'curriculum', modelClass:'exam', agentName:'lesson-analysis', requestType:'extract_exam', messages:[{ role:'user', content:'test' }], trace })).rejects.toMatchObject({ status:504 });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0][0].model).toBe('google/gemini-2.5-flash');
    expect(mocks.create.mock.calls[0][1].timeout).toBe(60000);
  });

  it('模試のJSON失敗を内部で再課金して修復せずジョブへ返す', async () => {
    mocks.create.mockReturnValueOnce(queuedResponse(okResponse('invalid json')));
    await expect(callModel({ router:'curriculum', modelClass:'exam', agentName:'lesson-analysis', requestType:'extract_exam', schema:z.object({ answer:z.string() }), messages:[{ role:'user', content:'test' }], trace })).rejects.toThrow('構造化出力');
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('用途別モデルが遅い場合は同じルーターを再試行せず別モデルに切り替える', async () => {
    mocks.create.mockReturnValueOnce({ withResponse: vi.fn().mockRejectedValue({ status: 504 }) })
      .mockReturnValueOnce(queuedResponse(okResponse('recovered')));
    const result = await callModel({ router: 'assessment', modelClass: 'advanced', agentName: 'assessment', requestType: 'final', messages: [{ role: 'user', content: 'test' }], trace });
    expect(result.data).toBe('recovered');
    expect(mocks.create.mock.calls.map(call => call[0].model)).toEqual(['orcarouter/toinowa-advanced', 'google/gemini-2.5-flash']);
    expect(result.meta.fallbackCount).toBe(1);
    expect(result.meta.resolvedModel).toBe('google/gemini-2.5-flash');
    expect(mocks.recordRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed_over' }));
  });

  it('構造化出力の修復前後の使用量を合算する', async () => {
    mocks.create.mockReturnValueOnce(queuedResponse(okResponse('invalid json')))
      .mockReturnValueOnce(queuedResponse(okResponse('{"answer":"ok"}')));
    const result = await callModel({ router: 'assessment', modelClass: 'advanced', agentName: 'assessment', requestType: 'final', schema: z.object({ answer: z.string() }), messages: [{ role: 'user', content: 'test' }], trace });
    expect(result.data).toEqual({ answer: 'ok' });
    expect(result.meta.costUsd).toBe(0.002);
    expect(result.meta.inputTokens).toBe(6);
    expect(result.meta.outputTokens).toBe(10);
  });

  it('正常応答を返し、Orcaの観測ヘッダーと費用を記録する', async () => {
    mocks.create.mockReturnValue(
      queuedResponse(
        okResponse('{"answer":"ok"}', {
          'x-orca-resolved-model': 'provider/actual',
          'x-orca-router': 'student-chat',
          'x-orca-request-id': 'req-1',
        }),
      ),
    );

    const result = await callModel({
      router: 'studentChat',
      agentName: 'learning-support',
      requestType: 'reply',
      messages: [{ role: 'user', content: 'hello' }],
      trace,
    });

    expect(result.data).toBe('{"answer":"ok"}');
    expect(result.meta.resolvedModel).toBe('provider/actual');
    expect(result.meta.orcaRequestId).toBe('req-1');
    expect(result.meta.costUsd).toBe(0.001);
    expect(result.meta.fallbackCount).toBe(0);
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok' }),
    );
  });

  it('成功時に返ったfallbackヘッダーだけをfallback_countへ反映する', async () => {
    mocks.create.mockReturnValue(
      queuedResponse(
        okResponse('fallback-result', {
          'x-orca-resolved-model': 'provider/fallback',
          'x-orca-fallback-level': '2',
        }),
      ),
    );

    const result = await callModel({
      router: 'studentChat',
      agentName: 'learning-support',
      requestType: 'reply',
      messages: [{ role: 'user', content: 'hello' }],
      trace,
    });

    expect(result.meta.fallbackCount).toBe(2);
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed_over' }),
    );
  });

  it('400系の入力エラーでは別モデルへ送らない', async () => {
    mocks.create.mockImplementation(() => ({
      withResponse: vi.fn().mockRejectedValue({ status: 400, error: { code: 'invalid_request' } }),
    }));

    await expect(
      callModel({
        router: 'assessment',
        agentName: 'assessment',
        requestType: 'grade',
        messages: [{ role: 'user', content: 'answer' }],
        trace,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorCode: 'invalid_request' }),
    );
  });

  it('一時障害は同一モデルを一度再試行する', async () => {
    mocks.create
      .mockImplementationOnce(() => ({
        withResponse: vi.fn().mockRejectedValue({ status: 503 }),
      }))
      .mockReturnValueOnce(queuedResponse(okResponse('recovered')));

    const result = await callModel({
      router: 'studentChat',
      agentName: 'learning-support',
      requestType: 'reply',
      messages: [{ role: 'user', content: 'hello' }],
      trace,
    });

    expect(result.data).toBe('recovered');
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(result.meta.attempts.map((attempt) => attempt.outcome)).toEqual([
      'error',
      'ok',
    ]);
  });
});

describe('AI cost and output safeguards', () => {
  const options = () => ({ router: 'assessment' as const, modelClass: 'advanced' as const, agentName: 'assessment' as const, requestType: 'test', messages: [{ role: 'user' as const, content: 'test' }], trace });
  beforeEach(() => {
    mocks.create.mockReset(); mocks.recordRun.mockReset();
    mocks.query.data = [{ ai_budget_limit_usd: 1 }]; mocks.query.error = null;
    trace.tenantId = crypto.randomUUID();
  });
  it.each([[], [{ ai_budget_limit_usd: null }], [{ ai_budget_limit_usd: 'bad' }], [{ ai_budget_limit_usd: -1 }]])('invalid or missing budget must prevent billing (%j)', async (...rows) => {
    mocks.query.data = rows;
    await expect(callModel(options())).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('budget lookup errors fail closed', async () => {
    mocks.query.error = { message: 'offline' };
    await expect(callModel(options())).rejects.toThrow('予算');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('zero budget produces an explicit local fallback without an AI call', async () => {
    mocks.query.data = [{ ai_budget_limit_usd: 0 }];
    const result = await callModel({ ...options(), degrade: () => '確認待ち' });
    expect(result.meta.degraded).toBe(true); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not pay for repair once this request consumed the available budget', async () => {
    mocks.query.data = [{ ai_budget_limit_usd: 0.001 }];
    mocks.create.mockReturnValue(queuedResponse(okResponse('invalid')));
    await expect(callModel({ ...options(), schema: z.object({ answer: z.string() }) })).rejects.toThrow('上限');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.recordRun).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ costUsd: 0.001 }) }));
  });
  it('logs blocked output as blocked and never retries it', async () => {
    mocks.create.mockReturnValue(queuedResponse(okResponse('unsafe')));
    await expect(callModel({ ...options(), validateOutput: () => { throw new SafetyBlocked('app_rule', 'secret'); } })).rejects.toBeInstanceOf(SafetyBlocked);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.recordRun).toHaveBeenCalledTimes(1);
    expect(mocks.recordRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked', meta: expect.objectContaining({ costUsd: 0.001, attempts: [expect.objectContaining({ outcome: 'blocked' })] }) }));
  });
  it('reports a recovered quota failure as successful failover', async () => {
    mocks.create.mockReturnValueOnce({ withResponse: vi.fn().mockRejectedValue({ status: 429 }) }).mockReturnValueOnce(queuedResponse(okResponse('recovered')));
    const result = await callModel(options());
    expect(result.meta.rateLimited).toBe(true);
    expect(mocks.recordRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed_over' }));
  });
  it('marks missing costs instead of treating them as observed free usage', async () => {
    const response = okResponse('ok');
    response.data.usage = { prompt_tokens: 1, completion_tokens: 2 } as typeof response.data.usage;
    mocks.create.mockReturnValue(queuedResponse(response));
    const result = await callModel(options());
    expect(result.meta.unpricedAttempts).toBe(1);
    expect(result.meta.costUsd).toBe(0);
  });
  it('all-provider outage preserves a local fallback and the failed attempts', async () => {
    mocks.create.mockReturnValue({ withResponse: vi.fn().mockRejectedValue({ status: 503 }) });
    const result = await callModel({ ...options(), degrade: () => '先生の確認待ち' });
    expect(result.data).toBe('先生の確認待ち'); expect(result.meta.degraded).toBe(true);
    expect(result.meta.attempts.every(attempt => attempt.outcome === 'error')).toBe(true);
    expect(mocks.create.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
