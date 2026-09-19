import { z } from 'zod';
import { ForbiddenError } from '@/lib/auth/errors';
import { recordAudit } from '@/lib/security/audit';

export interface ToolContext {
  tenantId: string;
  userId: string;
  studentId?: string | null;
  traceId: string;
}

export interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: T;
  handler(args: z.infer<T>, context: ToolContext): Promise<unknown>;
}

export type ToolRegistry = ReadonlyMap<string, ToolDefinition>;

export function createToolRegistry(definitions: ToolDefinition[]): ToolRegistry {
  const map = new Map<string, ToolDefinition>();
  for (const definition of definitions) {
    if (map.has(definition.name)) throw new Error(`duplicate tool: ${definition.name}`);
    map.set(definition.name, definition);
  }
  return map;
}

/** モデルの引数からtenant/studentスコープを受け取らず、常に実行コンテキストで固定する。 */
export async function dispatchTool(
  registry: ToolRegistry,
  name: string,
  rawArgs: unknown,
  context: ToolContext,
): Promise<unknown> {
  const definition = registry.get(name);
  if (!definition) {
    recordAudit({
      tenantId: context.tenantId,
      actorId: context.userId,
      actorKind: 'agent',
      action: 'tool.dispatch',
      resourceType: 'tool',
      result: 'deny',
      detail: { name, reason: 'not_allowed' },
      traceId: context.traceId,
    });
    throw new ForbiddenError(`許可されていないツールです: ${name}`);
  }

  const parsed = definition.inputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    recordAudit({
      tenantId: context.tenantId,
      actorId: context.userId,
      actorKind: 'agent',
      action: 'tool.dispatch',
      resourceType: 'tool',
      result: 'deny',
      detail: { name, reason: 'invalid_arguments' },
      traceId: context.traceId,
    });
    throw new ForbiddenError(`ツール引数が不正です: ${name}`);
  }

  recordAudit({
    tenantId: context.tenantId,
    actorId: context.userId,
    actorKind: 'agent',
    action: 'tool.dispatch',
    resourceType: 'tool',
    result: 'allow',
    detail: { name },
    traceId: context.traceId,
  });
  return definition.handler(parsed.data, context);
}
