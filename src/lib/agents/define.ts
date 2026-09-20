import 'server-only';
import { z } from 'zod';
import { callModel } from '@/lib/orcarouter/call';
import { SafetyBlocked } from '@/lib/orcarouter/errors';
import { preCheck, postCheck } from '@/lib/security/guard';
import type { Agent, AgentRunContext } from './types';
import type { AgentName, CallResult } from '@/lib/orcarouter/types';

export interface DefineAgentOptions<Input, Output> {
  name: AgentName;
  router: 'studentChat' | 'assessment' | 'curriculum' | 'safety';
  requestType: string;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  systemPrompt: string;
  buildUserMessage(input: Input): string;
  degrade?: (input: Input) => Output;
  skipInputRuleCheck?: boolean;
  maxOutputTokens?: number;
  outputText?(output: Output): string;
}

function outputAsText(output: unknown): string {
  if (typeof output === 'string') return output;
  return JSON.stringify(output);
}

export function defineAgent<Input, Output>(options: DefineAgentOptions<Input, Output>): Agent<Input, Output> {
  return {
    name: options.name,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    async run(rawInput: Input, trace: AgentRunContext): Promise<CallResult<Output>> {
      const input = options.inputSchema.parse(rawInput);
      const userMessage = options.buildUserMessage(input);
      const guarded = options.skipInputRuleCheck
        ? { masked: { text: userMessage }, inspection: null }
        : preCheck(userMessage);

      const result = await callModel({
        router: options.router,
        modelClass: trace.modelClass ?? (options.name === 'assessment' ? 'advanced' : undefined),
        agentName: options.name,
        requestType: options.requestType,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: guarded.masked.text },
        ],
        schema: options.outputSchema,
        maxOutputTokens: options.maxOutputTokens,
        degrade: options.degrade ? () => options.degrade!(input) : undefined,
        trace,
      });

      try {
        postCheck(options.outputText?.(result.data) ?? outputAsText(result.data), {
          systemFragments: [options.systemPrompt],
        });
      } catch (error) {
        if (error instanceof SafetyBlocked) throw error;
        throw error;
      }
      return result;
    },
  };
}
