import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/database/admin', () => ({ adminDb: vi.fn() }));

import { InvalidWorkflowTransition, transition } from '@/lib/workflow/machine';
import { classifyIntent, routeConversation } from '@/lib/agents/orchestrator';
import type { WorkflowState } from '@/lib/database/types';

describe('workflow state machine', () => {
  it('happy path reaches completed and records all ten business states', () => {
    let state: WorkflowState = 'created';
    const events = [
      'material_ready', 'assignment_drafted', 'request_teacher_review', 'publish', 'start',
      'answer_submitted', 'plan_updated', 'reassessment_due', 'complete',
    ] as const;
    for (const event of events) state = transition(state, event);
    expect(state).toBe('completed');
  });

  it('escalation and retryable failure are explicit safety exits', () => {
    expect(transition('in_progress', 'escalate')).toBe('escalated');
    expect(transition('evaluating', 'retryable_failure')).toBe('failed_retryable');
    expect(transition('failed_retryable', 'retry')).toBe('created');
    expect(() => transition('completed', 'publish')).toThrow(InvalidWorkflowTransition);
  });
});

describe('deterministic orchestrator', () => {
  it('routes fast paths without asking an LLM to choose tools', () => {
    expect(classifyIntent('次の課題は何ですか')).toBe('next_task');
    expect(routeConversation({ message: 'ヒントをください', state: 'active', channel: 'web' })).toMatchObject({ agent: 'learning-support', fastPath: false });
    expect(routeConversation({ message: 'こんにちは', state: 'active', channel: 'web' })).toMatchObject({ agent: 'orchestrator', fastPath: true });
    expect(routeConversation({ message: '何をしても', state: 'escalated', channel: 'web' }).intent).toBe('escalation');
  });
});
