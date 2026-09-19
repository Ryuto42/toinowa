// 自動生成。手で編集しないこと。`npm run db:types` で再生成する。
// 生成元: scripts/db-types.ts（pg_catalog を直接読む。Docker 不要）

export type Json =
  | string | number | boolean | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AgentRunStatus =
  | 'ok'
  | 'schema_repaired'
  | 'failed_over'
  | 'degraded'
  | 'rate_limited'
  | 'blocked'
  | 'error';

export type ApprovalDecision =
  | 'approved'
  | 'modified'
  | 'rejected';

export type ApprovalResource =
  | 'lesson'
  | 'assignment'
  | 'assessment'
  | 'plan'
  | 'broadcast'
  | 'intervention';

export type AssignmentKind =
  | 'initial'
  | 'review'
  | 'reassessment';

export type AssignmentStatus =
  | 'draft'
  | 'pending_approval'
  | 'published'
  | 'completed'
  | 'cancelled';

export type Channel =
  | 'web'
  | 'line';

export type ConvState =
  | 'active'
  | 'summarizing'
  | 'awaiting_assessment'
  | 'completed'
  | 'escalated'
  | 'abandoned';

export type EscalationKind =
  | 'low_confidence'
  | 'safety'
  | 'repeated_failure'
  | 'budget'
  | 'stalled'
  | 'distress';

export type EscalationStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'dismissed';

export type InterventionPriority =
  | 'urgent'
  | 'high'
  | 'medium'
  | 'low';

export type JobStatus =
  | 'queued'
  | 'leased'
  | 'succeeded'
  | 'failed'
  | 'dead'
  | 'cancelled';

export type LessonStatus =
  | 'draft'
  | 'material_ready'
  | 'analyzed'
  | 'published'
  | 'archived';

export type MsgActor =
  | 'student'
  | 'agent'
  | 'teacher'
  | 'system';

export type NotificationKind =
  | 'review_due'
  | 'new_assignment'
  | 'teacher_reply'
  | 'plan_updated'
  | 'announcement';

export type PlanStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'active'
  | 'superseded';

export type QuestionFormat =
  | 'mcq'
  | 'short_answer'
  | 'numeric'
  | 'explain'
  | 'transfer';

export type ReviewStatus =
  | 'auto_approved'
  | 'pending_review'
  | 'approved'
  | 'overridden'
  | 'rejected';

export type UserRole =
  | 'student'
  | 'teacher'
  | 'admin';

export type UserStatus =
  | 'active'
  | 'invited'
  | 'suspended';

export type WorkflowState =
  | 'created'
  | 'material_ready'
  | 'assignment_drafted'
  | 'teacher_review'
  | 'published'
  | 'in_progress'
  | 'evaluating'
  | 'plan_updated'
  | 'reassessment_scheduled'
  | 'completed'
  | 'escalated'
  | 'failed_retryable';

export interface Database {
  public: {
    Tables: {
      agent_run_attempts: {
        Row: {
          id: number;
          agent_run_id: string;
          attempt_no: number;
          model: string;
          outcome: string;
          latency_ms: number | null;
          error_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          agent_run_id: string;
          attempt_no: number;
          model: string;
          outcome: string;
          latency_ms?: number | null;
          error_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          agent_run_id?: string;
          attempt_no?: number;
          model?: string;
          outcome?: string;
          latency_ms?: number | null;
          error_code?: string | null;
          created_at?: string;
        };
      };
      agent_runs: {
        Row: {
          id: string;
          tenant_id: string;
          trace_id: string;
          parent_run_id: string | null;
          agent_name: string;
          request_type: string;
          model_tier: string;
          router_name: string;
          resolved_model: string | null;
          orca_request_id: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          estimated_cost_usd: number | null;
          latency_ms: number | null;
          ttft_ms: number | null;
          fallback_count: number;
          schema_valid: boolean | null;
          safety_result: Json;
          tool_calls: Json;
          status: AgentRunStatus;
          error_code: string | null;
          student_id: string | null;
          conversation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          trace_id: string;
          parent_run_id?: string | null;
          agent_name: string;
          request_type: string;
          model_tier?: string;
          router_name: string;
          resolved_model?: string | null;
          orca_request_id?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          estimated_cost_usd?: number | null;
          latency_ms?: number | null;
          ttft_ms?: number | null;
          fallback_count?: number;
          schema_valid?: boolean | null;
          safety_result?: Json;
          tool_calls?: Json;
          status: AgentRunStatus;
          error_code?: string | null;
          student_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          trace_id?: string;
          parent_run_id?: string | null;
          agent_name?: string;
          request_type?: string;
          model_tier?: string;
          router_name?: string;
          resolved_model?: string | null;
          orca_request_id?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          estimated_cost_usd?: number | null;
          latency_ms?: number | null;
          ttft_ms?: number | null;
          fallback_count?: number;
          schema_valid?: boolean | null;
          safety_result?: Json;
          tool_calls?: Json;
          status?: AgentRunStatus;
          error_code?: string | null;
          student_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
        };
      };
      ai_budget_ledger: {
        Row: {
          id: number;
          tenant_id: string;
          scope: string;
          scope_id: string;
          day: string;
          spent_usd: number;
          request_count: number;
        };
        Insert: {
          id?: number;
          tenant_id: string;
          scope: string;
          scope_id: string;
          day: string;
          spent_usd?: number;
          request_count?: number;
        };
        Update: {
          id?: number;
          tenant_id?: string;
          scope?: string;
          scope_id?: string;
          day?: string;
          spent_usd?: number;
          request_count?: number;
        };
      };
      announcements: {
        Row: {
          id: string;
          tenant_id: string;
          classroom_id: string | null;
          author_id: string;
          body: string;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          classroom_id?: string | null;
          author_id: string;
          body: string;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          classroom_id?: string | null;
          author_id?: string;
          body?: string;
          published_at?: string | null;
          created_at?: string;
        };
      };
      answers: {
        Row: {
          id: string;
          tenant_id: string;
          assignment_id: string | null;
          question_id: string;
          student_id: string;
          conversation_id: string | null;
          raw_answer: string;
          reasoning_text: string | null;
          hint_level: number;
          self_rating: number | null;
          time_spent_sec: number | null;
          answered_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          assignment_id?: string | null;
          question_id: string;
          student_id: string;
          conversation_id?: string | null;
          raw_answer: string;
          reasoning_text?: string | null;
          hint_level?: number;
          self_rating?: number | null;
          time_spent_sec?: number | null;
          answered_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          assignment_id?: string | null;
          question_id?: string;
          student_id?: string;
          conversation_id?: string | null;
          raw_answer?: string;
          reasoning_text?: string | null;
          hint_level?: number;
          self_rating?: number | null;
          time_spent_sec?: number | null;
          answered_at?: string;
        };
      };
      approvals: {
        Row: {
          id: string;
          tenant_id: string;
          resource_type: ApprovalResource;
          resource_id: string;
          requested_by: string;
          proposal: Json;
          decision: ApprovalDecision | null;
          decided_by: string | null;
          decided_at: string | null;
          modified_payload: Json | null;
          reject_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          resource_type: ApprovalResource;
          resource_id: string;
          requested_by?: string;
          proposal?: Json;
          decision?: ApprovalDecision | null;
          decided_by?: string | null;
          decided_at?: string | null;
          modified_payload?: Json | null;
          reject_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          resource_type?: ApprovalResource;
          resource_id?: string;
          requested_by?: string;
          proposal?: Json;
          decision?: ApprovalDecision | null;
          decided_by?: string | null;
          decided_at?: string | null;
          modified_payload?: Json | null;
          reject_reason?: string | null;
          created_at?: string;
        };
      };
      assessments: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          concept_id: string;
          score: number | null;
          confidence: number;
          component_scores: Json;
          misconceptions: Json;
          evidence_message_ids: string[];
          evidence_answer_ids: string[];
          difficulty_at_time: number | null;
          recommended_difficulty: number | null;
          difficulty_reason: string | null;
          reviewer_status: ReviewStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          override_score: number | null;
          override_note: string | null;
          version: number;
          agent_run_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          concept_id: string;
          score?: number | null;
          confidence: number;
          component_scores?: Json;
          misconceptions?: Json;
          evidence_message_ids?: string[];
          evidence_answer_ids?: string[];
          difficulty_at_time?: number | null;
          recommended_difficulty?: number | null;
          difficulty_reason?: string | null;
          reviewer_status?: ReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          override_score?: number | null;
          override_note?: string | null;
          version?: number;
          agent_run_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          concept_id?: string;
          score?: number | null;
          confidence?: number;
          component_scores?: Json;
          misconceptions?: Json;
          evidence_message_ids?: string[];
          evidence_answer_ids?: string[];
          difficulty_at_time?: number | null;
          recommended_difficulty?: number | null;
          difficulty_reason?: string | null;
          reviewer_status?: ReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          override_score?: number | null;
          override_note?: string | null;
          version?: number;
          agent_run_id?: string | null;
          created_at?: string;
        };
      };
      assignments: {
        Row: {
          id: string;
          tenant_id: string;
          lesson_id: string;
          classroom_id: string | null;
          student_id: string | null;
          question_ids: string[];
          kind: AssignmentKind;
          status: AssignmentStatus;
          due_at: string | null;
          published_at: string | null;
          approved_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          lesson_id: string;
          classroom_id?: string | null;
          student_id?: string | null;
          question_ids: string[];
          kind?: AssignmentKind;
          status?: AssignmentStatus;
          due_at?: string | null;
          published_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          lesson_id?: string;
          classroom_id?: string | null;
          student_id?: string | null;
          question_ids?: string[];
          kind?: AssignmentKind;
          status?: AssignmentStatus;
          due_at?: string | null;
          published_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: number;
          tenant_id: string;
          actor_id: string | null;
          actor_role: UserRole | null;
          actor_kind: string;
          action: string;
          resource_type: string;
          resource_id: string | null;
          result: string;
          detail: Json;
          ip: string | null;
          trace_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          tenant_id: string;
          actor_id?: string | null;
          actor_role?: UserRole | null;
          actor_kind?: string;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          result: string;
          detail?: Json;
          ip?: string | null;
          trace_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          tenant_id?: string;
          actor_id?: string | null;
          actor_role?: UserRole | null;
          actor_kind?: string;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          result?: string;
          detail?: Json;
          ip?: string | null;
          trace_id?: string | null;
          created_at?: string;
        };
      };
      channel_link_tokens: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          code: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          code: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          code?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
      };
      classrooms: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          subject: string;
          grade: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          subject: string;
          grade?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          subject?: string;
          grade?: string | null;
          created_at?: string;
        };
      };
      concepts: {
        Row: {
          id: string;
          tenant_id: string;
          lesson_id: string;
          name: string;
          description: string | null;
          prerequisite_concept_ids: string[];
          rubric: Json;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          lesson_id: string;
          name: string;
          description?: string | null;
          prerequisite_concept_ids?: string[];
          rubric?: Json;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          lesson_id?: string;
          name?: string;
          description?: string | null;
          prerequisite_concept_ids?: string[];
          rubric?: Json;
          order_index?: number;
          created_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          channel: Channel;
          external_thread_id: string | null;
          lesson_id: string | null;
          concept_id: string | null;
          state: ConvState;
          summary: string | null;
          summarized_through_seq: number;
          message_count: number;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          channel: Channel;
          external_thread_id?: string | null;
          lesson_id?: string | null;
          concept_id?: string | null;
          state?: ConvState;
          summary?: string | null;
          summarized_through_seq?: number;
          message_count?: number;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          channel?: Channel;
          external_thread_id?: string | null;
          lesson_id?: string | null;
          concept_id?: string | null;
          state?: ConvState;
          summary?: string | null;
          summarized_through_seq?: number;
          message_count?: number;
          started_at?: string;
          completed_at?: string | null;
        };
      };
      enrollments: {
        Row: {
          id: string;
          tenant_id: string;
          classroom_id: string;
          user_id: string;
          role: UserRole;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          classroom_id: string;
          user_id: string;
          role: UserRole;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          classroom_id?: string;
          user_id?: string;
          role?: UserRole;
          active?: boolean;
          created_at?: string;
        };
      };
      escalations: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string | null;
          classroom_id: string | null;
          kind: EscalationKind;
          priority: InterventionPriority;
          title: string;
          payload: Json;
          status: EscalationStatus;
          resolved_by: string | null;
          resolution_note: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id?: string | null;
          classroom_id?: string | null;
          kind: EscalationKind;
          priority?: InterventionPriority;
          title: string;
          payload?: Json;
          status?: EscalationStatus;
          resolved_by?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string | null;
          classroom_id?: string | null;
          kind?: EscalationKind;
          priority?: InterventionPriority;
          title?: string;
          payload?: Json;
          status?: EscalationStatus;
          resolved_by?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
      };
      guard_events: {
        Row: {
          id: number;
          tenant_id: string;
          agent_run_id: string | null;
          student_id: string | null;
          conversation_id: string | null;
          channel: Channel | null;
          source: string;
          category: string;
          rule: string;
          matched_excerpt: string | null;
          blocked_tools: string[];
          created_at: string;
        };
        Insert: {
          id?: number;
          tenant_id: string;
          agent_run_id?: string | null;
          student_id?: string | null;
          conversation_id?: string | null;
          channel?: Channel | null;
          source: string;
          category: string;
          rule: string;
          matched_excerpt?: string | null;
          blocked_tools?: string[];
          created_at?: string;
        };
        Update: {
          id?: number;
          tenant_id?: string;
          agent_run_id?: string | null;
          student_id?: string | null;
          conversation_id?: string | null;
          channel?: Channel | null;
          source?: string;
          category?: string;
          rule?: string;
          matched_excerpt?: string | null;
          blocked_tools?: string[];
          created_at?: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          tenant_id: string;
          kind: string;
          payload: Json;
          idempotency_key: string;
          status: JobStatus;
          priority: number;
          step: string;
          state: Json;
          attempt: number;
          max_attempts: number;
          run_after: string;
          locked_until: string | null;
          lease_token: string | null;
          last_error: string | null;
          trace_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          kind: string;
          payload?: Json;
          idempotency_key: string;
          status?: JobStatus;
          priority?: number;
          step?: string;
          state?: Json;
          attempt?: number;
          max_attempts?: number;
          run_after?: string;
          locked_until?: string | null;
          lease_token?: string | null;
          last_error?: string | null;
          trace_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          kind?: string;
          payload?: Json;
          idempotency_key?: string;
          status?: JobStatus;
          priority?: number;
          step?: string;
          state?: Json;
          attempt?: number;
          max_attempts?: number;
          run_after?: string;
          locked_until?: string | null;
          lease_token?: string | null;
          last_error?: string | null;
          trace_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      jobs_dead: {
        Row: {
          id: string;
          tenant_id: string;
          kind: string;
          payload: Json;
          idempotency_key: string;
          status: JobStatus;
          priority: number;
          step: string;
          state: Json;
          attempt: number;
          max_attempts: number;
          run_after: string;
          locked_until: string | null;
          lease_token: string | null;
          last_error: string | null;
          trace_id: string;
          created_at: string;
          updated_at: string;
          died_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          kind: string;
          payload?: Json;
          idempotency_key: string;
          status?: JobStatus;
          priority?: number;
          step?: string;
          state?: Json;
          attempt?: number;
          max_attempts?: number;
          run_after?: string;
          locked_until?: string | null;
          lease_token?: string | null;
          last_error?: string | null;
          trace_id?: string;
          created_at?: string;
          updated_at?: string;
          died_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          kind?: string;
          payload?: Json;
          idempotency_key?: string;
          status?: JobStatus;
          priority?: number;
          step?: string;
          state?: Json;
          attempt?: number;
          max_attempts?: number;
          run_after?: string;
          locked_until?: string | null;
          lease_token?: string | null;
          last_error?: string | null;
          trace_id?: string;
          created_at?: string;
          updated_at?: string;
          died_at?: string;
        };
      };
      learning_plans: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          period_start: string;
          period_end: string;
          tasks: Json;
          rationale: string;
          status: PlanStatus;
          approved_by: string | null;
          approved_at: string | null;
          supersedes_plan_id: string | null;
          agent_run_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          period_start: string;
          period_end: string;
          tasks?: Json;
          rationale?: string;
          status?: PlanStatus;
          approved_by?: string | null;
          approved_at?: string | null;
          supersedes_plan_id?: string | null;
          agent_run_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          period_start?: string;
          period_end?: string;
          tasks?: Json;
          rationale?: string;
          status?: PlanStatus;
          approved_by?: string | null;
          approved_at?: string | null;
          supersedes_plan_id?: string | null;
          agent_run_id?: string | null;
          created_at?: string;
        };
      };
      lessons: {
        Row: {
          id: string;
          tenant_id: string;
          classroom_id: string;
          title: string;
          taught_at: string | null;
          objectives: Json;
          status: LessonStatus;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          classroom_id: string;
          title: string;
          taught_at?: string | null;
          objectives?: Json;
          status?: LessonStatus;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          classroom_id?: string;
          title?: string;
          taught_at?: string | null;
          objectives?: Json;
          status?: LessonStatus;
          created_by?: string;
          created_at?: string;
        };
      };
      line_account_links: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          line_user_id_encrypted: string | null;
          line_user_id_hmac: string | null;
          status: string;
          linked_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          line_user_id_encrypted?: string | null;
          line_user_id_hmac?: string | null;
          status?: string;
          linked_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          line_user_id_encrypted?: string | null;
          line_user_id_hmac?: string | null;
          status?: string;
          linked_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
      };
      material_chunks: {
        Row: {
          id: string;
          tenant_id: string;
          material_id: string;
          lesson_id: string | null;
          concept_ids: string[];
          chunk_index: number;
          content: string;
          token_count: number;
          embedding: number[] | null;
          embedding_model: string | null;
          safety_flags: Json;
          quarantined: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          material_id: string;
          lesson_id?: string | null;
          concept_ids?: string[];
          chunk_index: number;
          content: string;
          token_count?: number;
          embedding?: number[] | null;
          embedding_model?: string | null;
          safety_flags?: Json;
          quarantined?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          material_id?: string;
          lesson_id?: string | null;
          concept_ids?: string[];
          chunk_index?: number;
          content?: string;
          token_count?: number;
          embedding?: number[] | null;
          embedding_model?: string | null;
          safety_flags?: Json;
          quarantined?: boolean;
          created_at?: string;
        };
      };
      materials: {
        Row: {
          id: string;
          tenant_id: string;
          lesson_id: string | null;
          storage_path: string;
          filename: string;
          mime_type: string;
          byte_size: number | null;
          content_sha256: string | null;
          ingest_status: string;
          ingest_error: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          lesson_id?: string | null;
          storage_path: string;
          filename: string;
          mime_type: string;
          byte_size?: number | null;
          content_sha256?: string | null;
          ingest_status?: string;
          ingest_error?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          lesson_id?: string | null;
          storage_path?: string;
          filename?: string;
          mime_type?: string;
          byte_size?: number | null;
          content_sha256?: string | null;
          ingest_status?: string;
          ingest_error?: string | null;
          created_by?: string;
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          tenant_id: string;
          conversation_id: string;
          seq: number;
          actor: MsgActor;
          content_redacted: string;
          channel_message_id: string | null;
          channel: Channel;
          delivery_status: string;
          safety_flags: Json;
          agent_run_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_id: string;
          seq: number;
          actor: MsgActor;
          content_redacted: string;
          channel_message_id?: string | null;
          channel?: Channel;
          delivery_status?: string;
          safety_flags?: Json;
          agent_run_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_id?: string;
          seq?: number;
          actor?: MsgActor;
          content_redacted?: string;
          channel_message_id?: string | null;
          channel?: Channel;
          delivery_status?: string;
          safety_flags?: Json;
          agent_run_id?: string | null;
          created_at?: string;
        };
      };
      model_disables: {
        Row: {
          id: string;
          tenant_id: string;
          model: string;
          reason: string | null;
          disabled_by: string | null;
          disabled_at: string;
          released_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          model: string;
          reason?: string | null;
          disabled_by?: string | null;
          disabled_at?: string;
          released_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          model?: string;
          reason?: string | null;
          disabled_by?: string | null;
          disabled_at?: string;
          released_at?: string | null;
        };
      };
      notifications: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          kind: NotificationKind;
          title: string;
          body: string;
          href: string | null;
          payload: Json;
          scheduled_for: string;
          delivered_channels: Channel[];
          delivered_at: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          kind: NotificationKind;
          title: string;
          body: string;
          href?: string | null;
          payload?: Json;
          scheduled_for?: string;
          delivered_channels?: Channel[];
          delivered_at?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          kind?: NotificationKind;
          title?: string;
          body?: string;
          href?: string | null;
          payload?: Json;
          scheduled_for?: string;
          delivered_channels?: Channel[];
          delivered_at?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          failed_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          failed_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          created_at?: string;
          failed_at?: string | null;
        };
      };
      questions: {
        Row: {
          id: string;
          tenant_id: string;
          concept_id: string;
          difficulty: number;
          format: QuestionFormat;
          body: string;
          choices: Json | null;
          expected_answer: Json | null;
          grading_rubric: Json | null;
          hints: Json;
          is_transfer: boolean;
          source_agent_run_id: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          concept_id: string;
          difficulty: number;
          format: QuestionFormat;
          body: string;
          choices?: Json | null;
          expected_answer?: Json | null;
          grading_rubric?: Json | null;
          hints?: Json;
          is_transfer?: boolean;
          source_agent_run_id?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          concept_id?: string;
          difficulty?: number;
          format?: QuestionFormat;
          body?: string;
          choices?: Json | null;
          expected_answer?: Json | null;
          grading_rubric?: Json | null;
          hints?: Json;
          is_transfer?: boolean;
          source_agent_run_id?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
      };
      review_schedules: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          concept_id: string;
          due_at: string;
          interval_days: number;
          ease: number;
          repetition: number;
          last_assessment_id: string | null;
          fulfilled_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          concept_id: string;
          due_at: string;
          interval_days?: number;
          ease?: number;
          repetition?: number;
          last_assessment_id?: string | null;
          fulfilled_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          concept_id?: string;
          due_at?: string;
          interval_days?: number;
          ease?: number;
          repetition?: number;
          last_assessment_id?: string | null;
          fulfilled_at?: string | null;
        };
      };
      school_codes: {
        Row: {
          code: string;
          tenant_id: string;
          active: boolean;
        };
        Insert: {
          code: string;
          tenant_id: string;
          active?: boolean;
        };
        Update: {
          code?: string;
          tenant_id?: string;
          active?: boolean;
        };
      };
      student_profiles: {
        Row: {
          user_id: string;
          tenant_id: string;
          grade: string | null;
          learning_preferences: Json;
          daily_time_limit_min: number;
          notification_settings: Json;
          consent_status: Json;
          current_difficulty: number;
          streak_days: number;
          last_active_on: string | null;
        };
        Insert: {
          user_id: string;
          tenant_id: string;
          grade?: string | null;
          learning_preferences?: Json;
          daily_time_limit_min?: number;
          notification_settings?: Json;
          consent_status?: Json;
          current_difficulty?: number;
          streak_days?: number;
          last_active_on?: string | null;
        };
        Update: {
          user_id?: string;
          tenant_id?: string;
          grade?: string | null;
          learning_preferences?: Json;
          daily_time_limit_min?: number;
          notification_settings?: Json;
          consent_status?: Json;
          current_difficulty?: number;
          streak_days?: number;
          last_active_on?: string | null;
        };
      };
      teacher_questions: {
        Row: {
          id: string;
          tenant_id: string;
          student_id: string;
          conversation_id: string | null;
          concept_id: string | null;
          body: string;
          answered_by: string | null;
          answer_body: string | null;
          answered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          student_id: string;
          conversation_id?: string | null;
          concept_id?: string | null;
          body: string;
          answered_by?: string | null;
          answer_body?: string | null;
          answered_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          student_id?: string;
          conversation_id?: string | null;
          concept_id?: string | null;
          body?: string;
          answered_by?: string | null;
          answer_body?: string | null;
          answered_at?: string | null;
          created_at?: string;
        };
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          plan: string;
          retention_days: number;
          ai_budget_limit_usd: number;
          line_channel_config_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          plan?: string;
          retention_days?: number;
          ai_budget_limit_usd?: number;
          line_channel_config_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          plan?: string;
          retention_days?: number;
          ai_budget_limit_usd?: number;
          line_channel_config_id?: string | null;
          created_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          tenant_id: string;
          role: UserRole;
          display_name: string;
          email: string;
          login_identifier: string | null;
          status: UserStatus;
          created_at: string;
        };
        Insert: {
          id: string;
          tenant_id: string;
          role: UserRole;
          display_name: string;
          email: string;
          login_identifier?: string | null;
          status?: UserStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          role?: UserRole;
          display_name?: string;
          email?: string;
          login_identifier?: string | null;
          status?: UserStatus;
          created_at?: string;
        };
      };
      workflow_runs: {
        Row: {
          id: string;
          tenant_id: string;
          subject_type: string;
          subject_id: string;
          state: WorkflowState;
          state_entered_at: string;
          context: Json;
          retry_count: number;
          last_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          subject_type: string;
          subject_id: string;
          state?: WorkflowState;
          state_entered_at?: string;
          context?: Json;
          retry_count?: number;
          last_error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          subject_type?: string;
          subject_id?: string;
          state?: WorkflowState;
          state_entered_at?: string;
          context?: Json;
          retry_count?: number;
          last_error?: string | null;
          created_at?: string;
        };
      };
      workflow_transitions: {
        Row: {
          id: number;
          workflow_run_id: string;
          from_state: WorkflowState | null;
          to_state: WorkflowState;
          trigger: string;
          actor: string;
          trace_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          workflow_run_id: string;
          from_state?: WorkflowState | null;
          to_state: WorkflowState;
          trigger: string;
          actor: string;
          trace_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          workflow_run_id?: string;
          from_state?: WorkflowState | null;
          to_state?: WorkflowState;
          trigger?: string;
          actor?: string;
          trace_id?: string | null;
          created_at?: string;
        };
      };
    };
    Enums: {
      agent_run_status: AgentRunStatus;
      approval_decision: ApprovalDecision;
      approval_resource: ApprovalResource;
      assignment_kind: AssignmentKind;
      assignment_status: AssignmentStatus;
      channel: Channel;
      conv_state: ConvState;
      escalation_kind: EscalationKind;
      escalation_status: EscalationStatus;
      intervention_priority: InterventionPriority;
      job_status: JobStatus;
      lesson_status: LessonStatus;
      msg_actor: MsgActor;
      notification_kind: NotificationKind;
      plan_status: PlanStatus;
      question_format: QuestionFormat;
      review_status: ReviewStatus;
      user_role: UserRole;
      user_status: UserStatus;
      workflow_state: WorkflowState;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
