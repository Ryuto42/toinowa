import 'server-only';
import { adminDb } from '@/lib/database/admin';
import type { Json } from '@/lib/database/types';

export interface AuditEvent {
  tenantId: string;
  actorId?: string | null;
  actorRole?: 'student' | 'teacher' | 'admin' | null;
  actorKind?: 'user' | 'agent' | 'system';
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: 'allow' | 'deny' | 'error';
  detail?: Json;
  traceId?: string | null;
}

export function recordAudit(event: AuditEvent): void {
  void Promise.resolve(
    adminDb()
      .from('audit_logs')
      .insert({
        tenant_id: event.tenantId,
        actor_id: event.actorId ?? null,
        actor_role: event.actorRole ?? null,
        actor_kind: event.actorKind ?? 'user',
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId ?? null,
        result: event.result,
        detail: event.detail ?? {},
        trace_id: event.traceId ?? null,
      }),
  )
    .then(({ error }) => {
      if (error) console.error('[audit] write failed:', error.message);
    })
    .catch((error: unknown) => console.error('[audit] write failed:', error));
}

export function recordGuardEvent(input: {
  tenantId: string;
  agentRunId?: string | null;
  studentId?: string | null;
  conversationId?: string | null;
  source: string;
  category: string;
  rule: string;
  matchedExcerpt?: string | null;
  blockedTools?: string[];
}): void {
  void Promise.resolve(
    adminDb()
      .from('guard_events')
      .insert({
        tenant_id: input.tenantId,
        agent_run_id: input.agentRunId ?? null,
        student_id: input.studentId ?? null,
        conversation_id: input.conversationId ?? null,
        source: input.source,
        category: input.category,
        rule: input.rule,
        matched_excerpt: input.matchedExcerpt ?? null,
        blocked_tools: input.blockedTools ?? [],
      }),
  )
    .then(({ error }) => {
      if (error) console.error('[guard_events] write failed:', error.message);
    })
    .catch((error: unknown) => console.error('[guard_events] write failed:', error));
}
