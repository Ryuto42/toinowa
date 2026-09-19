import 'server-only';
import { adminDb } from '@/lib/database/admin';
import type { Json, WorkflowState } from '@/lib/database/types';

export type WorkflowEvent =
  | 'material_ready'
  | 'assignment_drafted'
  | 'request_teacher_review'
  | 'publish'
  | 'start'
  | 'answer_submitted'
  | 'evaluation_complete'
  | 'plan_updated'
  | 'reassessment_due'
  | 'complete'
  | 'escalate'
  | 'retryable_failure'
  | 'retry';

export class InvalidWorkflowTransition extends Error {
  constructor(readonly state: WorkflowState, readonly event: WorkflowEvent) {
    super(`workflow transition is not allowed: ${state} + ${event}`);
    this.name = 'InvalidWorkflowTransition';
  }
}

/**
 * 自律ワークフローの状態表。LLMには状態遷移を決めさせない。
 * `escalate` と `retryable_failure` は安全弁として各進行状態から横断的に入れる。
 */
const table: Record<WorkflowState, Partial<Record<WorkflowEvent, WorkflowState>>> = {
  created: { material_ready: 'material_ready', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  material_ready: { assignment_drafted: 'assignment_drafted', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  assignment_drafted: { request_teacher_review: 'teacher_review', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  teacher_review: { publish: 'published', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  published: { start: 'in_progress', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  in_progress: { answer_submitted: 'evaluating', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  evaluating: { plan_updated: 'plan_updated', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  plan_updated: { reassessment_due: 'reassessment_scheduled', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  reassessment_scheduled: { complete: 'completed', escalate: 'escalated', retryable_failure: 'failed_retryable' },
  completed: { },
  escalated: { retry: 'created', complete: 'completed' },
  failed_retryable: { retry: 'created', escalate: 'escalated' },
};

export function canTransition(state: WorkflowState, event: WorkflowEvent): boolean {
  return Boolean(table[state][event]);
}

export function transition(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  const next = table[state][event];
  if (!next) throw new InvalidWorkflowTransition(state, event);
  return next;
}

export function allowedEvents(state: WorkflowState): WorkflowEvent[] {
  return Object.keys(table[state]) as WorkflowEvent[];
}

export async function startWorkflow(input: {
  tenantId: string;
  subjectType: 'lesson' | 'student_concept';
  subjectId: string;
  context?: Record<string, unknown>;
}): Promise<unknown> {
  const { data, error } = await adminDb()
    .from('workflow_runs')
    .upsert(
      {
        tenant_id: input.tenantId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        context: (input.context ?? {}) as Json,
      },
      { onConflict: 'subject_type,subject_id', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`workflow start failed: ${error.message}`);
  if (data) return data;
  const existing = await adminDb()
    .from('workflow_runs')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('subject_type', input.subjectType)
    .eq('subject_id', input.subjectId)
    .single();
  if (existing.error || !existing.data) throw new Error(existing.error?.message ?? 'workflow not found');
  return existing.data;
}

/** DB更新は必ず tenant_id と現在stateを条件にして、古い実行が上書きしないようにする。 */
export async function advanceWorkflow(input: {
  tenantId: string;
  workflowRunId: string;
  event: WorkflowEvent;
  actor: 'agent' | 'teacher' | 'admin' | 'system';
  traceId?: string;
  contextPatch?: Record<string, unknown>;
}): Promise<unknown> {
  const db = adminDb();
  const current = await db
    .from('workflow_runs')
    .select('*')
    .eq('id', input.workflowRunId)
    .eq('tenant_id', input.tenantId)
    .single();
  if (current.error || !current.data) throw new Error('workflow not found');
  const nextState = transition(current.data.state, input.event);
  const context = {
    ...(current.data.context && typeof current.data.context === 'object' ? current.data.context : {}),
    ...(input.contextPatch ?? {}),
  };
  const updated = await db
    .from('workflow_runs')
    .update({ state: nextState, state_entered_at: new Date().toISOString(), context: context as Json, last_error: null })
    .eq('id', input.workflowRunId)
    .eq('tenant_id', input.tenantId)
    .eq('state', current.data.state)
    .select('*')
    .maybeSingle();
  if (updated.error) throw new Error(`workflow update failed: ${updated.error.message}`);
  if (!updated.data) throw new Error('workflow changed concurrently; retry the transition');
  const transitionRow = await db.from('workflow_transitions').insert({
    workflow_run_id: input.workflowRunId,
    from_state: current.data.state,
    to_state: nextState,
    trigger: input.event,
    actor: input.actor,
    trace_id: input.traceId ?? null,
  }).select('*').single();
  if (transitionRow.error) throw new Error(`workflow transition log failed: ${transitionRow.error.message}`);
  return updated.data;
}
