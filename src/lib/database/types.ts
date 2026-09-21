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
  | 'distress'
  | 'ai_suspected';

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

export type WorkProgress =
  | 'not_started'
  | 'in_progress'
  | 'completed';

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
        Relationships: [
          {
            foreignKeyName: 'agent_run_attempts_agent_run_id_fkey';
            columns: ['agent_run_id'];
            isOneToOne: false;
            referencedRelation: 'agent_runs';
            referencedColumns: ['id'];
          },
        ];
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
          actor_id: string | null;
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
          actor_id?: string | null;
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
          actor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_runs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_runs_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_runs_parent_run_id_fkey';
            columns: ['parent_run_id'];
            isOneToOne: false;
            referencedRelation: 'agent_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_runs_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_runs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'ai_budget_ledger_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'announcements_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'announcements_classroom_id_fkey';
            columns: ['classroom_id'];
            isOneToOne: false;
            referencedRelation: 'classrooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'announcements_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
          typing_ms: number | null;
          paste_count: number;
          keystrokes: number | null;
          ai_likelihood: number | null;
          ai_signals: Json;
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
          typing_ms?: number | null;
          paste_count?: number;
          keystrokes?: number | null;
          ai_likelihood?: number | null;
          ai_signals?: Json;
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
          typing_ms?: number | null;
          paste_count?: number;
          keystrokes?: number | null;
          ai_likelihood?: number | null;
          ai_signals?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'answers_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'answers_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'answers_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'answers_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'approvals_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approvals_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
          conversation_id: string | null;
          is_final: boolean;
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
          conversation_id?: string | null;
          is_final?: boolean;
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
          conversation_id?: string | null;
          is_final?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'assessments_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: true;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      assignment_progress: {
        Row: {
          id: string;
          tenant_id: string;
          assignment_id: string;
          student_id: string;
          status: WorkProgress;
          opened_at: string | null;
          completed_at: string | null;
          active_seconds: number;
          last_seen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          assignment_id: string;
          student_id: string;
          status?: WorkProgress;
          opened_at?: string | null;
          completed_at?: string | null;
          active_seconds?: number;
          last_seen_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          assignment_id?: string;
          student_id?: string;
          status?: WorkProgress;
          opened_at?: string | null;
          completed_at?: string | null;
          active_seconds?: number;
          last_seen_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assignment_progress_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignment_progress_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignment_progress_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
          source_plan_id: string | null;
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
          source_plan_id?: string | null;
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
          source_plan_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'assignments_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignments_classroom_id_fkey';
            columns: ['classroom_id'];
            isOneToOne: false;
            referencedRelation: 'classrooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignments_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignments_source_plan_id_fkey';
            columns: ['source_plan_id'];
            isOneToOne: true;
            referencedRelation: 'learning_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignments_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'channel_link_tokens_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'channel_link_tokens_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'classrooms_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'concepts_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'concepts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'conversations_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'enrollments_classroom_id_fkey';
            columns: ['classroom_id'];
            isOneToOne: false;
            referencedRelation: 'classrooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'escalations_classroom_id_fkey';
            columns: ['classroom_id'];
            isOneToOne: false;
            referencedRelation: 'classrooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'escalations_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'escalations_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'escalations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      exam_analyses: {
        Row: {
          id: string;
          tenant_id: string;
          created_by: string;
          student_id: string | null;
          status: string;
          images: Json | null;
          baseline: Json;
          result: Json | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          tenant_id: string;
          created_by: string;
          student_id?: string | null;
          status?: string;
          images?: Json | null;
          baseline?: Json;
          result?: Json | null;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          created_by?: string;
          student_id?: string | null;
          status?: string;
          images?: Json | null;
          baseline?: Json;
          result?: Json | null;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exam_analyses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_analyses_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_analyses_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'guard_events_agent_run_id_fkey';
            columns: ['agent_run_id'];
            isOneToOne: false;
            referencedRelation: 'agent_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guard_events_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guard_events_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guard_events_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'jobs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [];
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
        Relationships: [
          {
            foreignKeyName: 'learning_plans_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_plans_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_plans_supersedes_plan_id_fkey';
            columns: ['supersedes_plan_id'];
            isOneToOne: false;
            referencedRelation: 'learning_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_plans_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'lessons_classroom_id_fkey';
            columns: ['classroom_id'];
            isOneToOne: false;
            referencedRelation: 'classrooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lessons_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lessons_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'line_account_links_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'line_account_links_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'material_chunks_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_chunks_material_id_fkey';
            columns: ['material_id'];
            isOneToOne: false;
            referencedRelation: 'materials';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_chunks_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'materials_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'materials_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'materials_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'model_disables_disabled_by_fkey';
            columns: ['disabled_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'model_disables_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'notifications_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'questions_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questions_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'review_schedules_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_schedules_last_assessment_id_fkey';
            columns: ['last_assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_schedules_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_schedules_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'school_codes_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      student_profiles: {
        Row: {
          user_id: string;
          tenant_id: string;
          grade: string | null;
          learning_preferences: Json;
          daily_time_limit_min: number | null;
          notification_settings: Json;
          consent_status: Json;
          current_difficulty: number;
          streak_days: number;
          last_active_on: string | null;
          learning_goal: string;
          exam_results: string;
          weak_areas: string;
          exam_analysis_id: string | null;
        };
        Insert: {
          user_id: string;
          tenant_id: string;
          grade?: string | null;
          learning_preferences?: Json;
          daily_time_limit_min?: number | null;
          notification_settings?: Json;
          consent_status?: Json;
          current_difficulty?: number;
          streak_days?: number;
          last_active_on?: string | null;
          learning_goal?: string;
          exam_results?: string;
          weak_areas?: string;
          exam_analysis_id?: string | null;
        };
        Update: {
          user_id?: string;
          tenant_id?: string;
          grade?: string | null;
          learning_preferences?: Json;
          daily_time_limit_min?: number | null;
          notification_settings?: Json;
          consent_status?: Json;
          current_difficulty?: number;
          streak_days?: number;
          last_active_on?: string | null;
          learning_goal?: string;
          exam_results?: string;
          weak_areas?: string;
          exam_analysis_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'student_profiles_exam_analysis_id_fkey';
            columns: ['exam_analysis_id'];
            isOneToOne: false;
            referencedRelation: 'exam_analyses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'student_profiles_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'student_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'teacher_questions_answered_by_fkey';
            columns: ['answered_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_questions_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_questions_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_questions_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_questions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          tenant_id: string;
          role: UserRole;
          display_name: string;
          email: string | null;
          login_identifier: string | null;
          status: UserStatus;
          created_at: string;
          must_change_password: boolean;
          password_revision: number;
          password_operation_until: string | null;
        };
        Insert: {
          id: string;
          tenant_id: string;
          role: UserRole;
          display_name: string;
          email?: string | null;
          login_identifier?: string | null;
          status?: UserStatus;
          created_at?: string;
          must_change_password?: boolean;
          password_revision?: number;
          password_operation_until?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          role?: UserRole;
          display_name?: string;
          email?: string | null;
          login_identifier?: string | null;
          status?: UserStatus;
          created_at?: string;
          must_change_password?: boolean;
          password_revision?: number;
          password_operation_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'users_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'workflow_runs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'workflow_transitions_workflow_run_id_fkey';
            columns: ['workflow_run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_exam_analysis: {
        Args: {
          p_tenant: string;
          p_analysis: string;
        };
        Returns: string;
      };
      attach_exam_analysis: {
        Args: {
          p_tenant: string;
          p_actor: string;
          p_student: string;
          p_analysis: string;
        };
        Returns: void;
      };
      begin_password_change: {
        Args: {
          p_tenant: string;
          p_user: string;
        };
        Returns: number;
      };
      begin_password_reset: {
        Args: {
          p_tenant: string;
          p_actor: string;
          p_user: string;
        };
        Returns: number;
      };
      bump_ai_budget: {
        Args: {
          p_tenant: string;
          p_scope: string;
          p_scope_id: string;
          p_cost: number;
        };
        Returns: void;
      };
      claim_jobs: {
        Args: {
          p_limit?: number;
          p_lease_sec?: number;
        };
        Returns: unknown[];
      };
      create_explanation_work: {
        Args: {
          p_tenant: string;
          p_actor: string;
          p_classroom: string;
          p_title: string;
          p_body: string;
          p_content: string;
          p_difficulty: number;
          p_student?: string;
          p_plan?: string;
          p_publish?: boolean;
          p_due_at?: string;
        };
        Returns: string;
      };
      decide_learning_approval: {
        Args: {
          p_tenant: string;
          p_actor: string;
          p_approval: string;
          p_decision: string;
          p_reason?: string;
          p_due_at?: string;
        };
        Returns: Json;
      };
      edit_managed_user: {
        Args: {
          p_tenant: string;
          p_actor: string;
          p_user: string;
          p_patch: Json;
        };
        Returns: void;
      };
      fail_job_permanently: {
        Args: {
          p_job_id: string;
          p_error: string;
        };
        Returns: void;
      };
      fail_leased_job: {
        Args: {
          p_job_id: string;
          p_lease_token: string;
          p_error: string;
        };
        Returns: boolean;
      };
      match_material_chunks: {
        Args: {
          p_tenant: string;
          p_embedding: number[];
          p_lesson?: string;
          p_concept?: string;
          p_limit?: number;
          p_min_similarity?: number;
        };
        Returns: Json[];
      };
      queue_exam_analysis: {
        Args: {
          p_tenant: string;
          p_actor: string;
          p_analysis: string;
          p_images: Json;
          p_baseline: Json;
        };
        Returns: void;
      };
      rls_auto_enable: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      search_material_chunks_text: {
        Args: {
          p_tenant: string;
          p_query: string;
          p_lesson?: string;
          p_concept?: string;
          p_limit?: number;
        };
        Returns: Json[];
      };
      set_classroom_members: {
        Args: {
          p_tenant: string;
          p_actor: string;
          p_classroom: string;
          p_teachers: string[];
          p_students: string[];
        };
        Returns: void;
      };
      today_ai_spend: {
        Args: {
          p_tenant: string;
        };
        Returns: number;
      };
      undo_last_exchange: {
        Args: {
          p_tenant: string;
          p_student: string;
          p_conversation: string;
        };
        Returns: Json[];
      };
    };
    CompositeTypes: {
      [_ in never]: never;
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
      work_progress: WorkProgress;
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
