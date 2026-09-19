import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    data: [] as unknown[],
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
    mocks.query.data = [];
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
