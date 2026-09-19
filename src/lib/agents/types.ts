import type { z } from 'zod';
import type { AgentName, CallResult, TraceCtx } from '@/lib/orcarouter/types';

export interface AgentRunContext extends TraceCtx {
  userId?: string | null;
}

export interface Agent<Input, Output> {
  name: AgentName;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  run(input: Input, trace: AgentRunContext): Promise<CallResult<Output>>;
}

export type AgentInputOf<T> = T extends Agent<infer Input, unknown> ? Input : never;
export type AgentOutputOf<T> = T extends Agent<unknown, infer Output> ? Output : never;
