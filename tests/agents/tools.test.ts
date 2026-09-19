import { describe, expect, it, vi } from 'vitest';

// tool dispatch is a server-side module; replace Next's guard for this pure unit test.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/security/audit', () => ({ recordAudit: vi.fn() }));

import { createToolRegistry, dispatchTool } from '@/lib/agents/tools';
import { z } from 'zod';

describe('tool allowlist', () => {
  it('許可したツールだけをスキーマ検証後に実行する', async () => {
    const handler = vi.fn(async (args: { questionId: string }) => ({ ok: args.questionId }));
    const registry = createToolRegistry([
      { name: 'read_question', description: 'read', inputSchema: z.object({ questionId: z.uuid() }), handler },
    ]);
    const context = { tenantId: 't', userId: 'u', traceId: 'trace' };
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(dispatchTool(registry, 'read_question', { questionId: id }, context)).resolves.toEqual({ ok: id });
    expect(handler).toHaveBeenCalledWith({ questionId: id }, context);
  });

  it('未許可ツールと不正引数を拒否する', async () => {
    const registry = createToolRegistry([
      { name: 'read_question', description: 'read', inputSchema: z.object({ questionId: z.uuid() }), handler: vi.fn() },
    ]);
    const context = { tenantId: 't', userId: 'u', traceId: 'trace' };
    await expect(dispatchTool(registry, 'delete_everything', {}, context)).rejects.toThrow('許可されていない');
    await expect(dispatchTool(registry, 'read_question', { questionId: 'other' }, context)).rejects.toThrow('引数が不正');
  });
});
