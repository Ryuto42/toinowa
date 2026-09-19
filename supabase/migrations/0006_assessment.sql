-- 評価・学習計画・復習予定・介入・承認。

create table assessments (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  student_id            uuid not null references users(id) on delete cascade,
  concept_id            uuid not null references concepts(id) on delete cascade,
  score                 numeric(4,3) check (score between 0 and 1),
  confidence            numeric(4,3) not null check (confidence between 0 and 1),
  -- 設計書12.2の5成分と「実際に適用した重み」のスナップショット。
  -- 重みを定数にしている以上、後から解釈できるようにここへ残すことが必須。
  -- [{key,raw,weight,applied}]
  component_scores      jsonb not null default '[]'::jsonb,
  -- [{code,label,evidence_message_ids[],severity}]
  misconceptions        jsonb not null default '[]'::jsonb,
  -- 根拠。先生は必ず「なぜそう判断したか」を訊く。
  evidence_message_ids  uuid[] not null default '{}',
  evidence_answer_ids   uuid[] not null default '{}',
  difficulty_at_time    smallint,
  recommended_difficulty smallint,
  -- 難易度の増減理由を人間可読の日本語で。「モデルが決めました」は答えにならない。
  difficulty_reason     text,
  -- confidence < 0.6 は必ず pending_review になる（機械的なHITLゲート）
  reviewer_status       review_status not null default 'auto_approved',
  reviewed_by           uuid references users(id),
  reviewed_at           timestamptz,
  override_score        numeric(4,3) check (override_score between 0 and 1),
  override_note         text,
  version               int not null default 1,
  agent_run_id          uuid,
  created_at            timestamptz not null default now()
);
create index assessments_student_concept_idx
  on assessments (student_id, concept_id, created_at desc);
create index assessments_pending_idx
  on assessments (tenant_id, created_at)
  where reviewer_status = 'pending_review';

create table learning_plans (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  student_id         uuid not null references users(id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  -- [{concept_id,goal,format,difficulty,scheduled_for,est_min,completion_criteria}]
  tasks              jsonb not null default '[]'::jsonb,
  -- 生成理由（設計書13.3）。先生の確認要否の判断材料になる。
  rationale          text not null default '',
  status             plan_status not null default 'draft',
  approved_by        uuid references users(id),
  approved_at        timestamptz,
  supersedes_plan_id uuid references learning_plans(id),
  agent_run_id       uuid,
  created_at         timestamptz not null default now()
);
create index learning_plans_student_idx
  on learning_plans (student_id, status, period_start desc);

-- 間隔反復。pg_cron が due_at を見て通知とジョブを起こす。
create table review_schedules (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  student_id         uuid not null references users(id) on delete cascade,
  concept_id         uuid not null references concepts(id) on delete cascade,
  due_at             timestamptz not null,
  interval_days      int not null default 1,
  ease               numeric(3,2) not null default 2.50,
  repetition         int not null default 0,
  last_assessment_id uuid references assessments(id) on delete set null,
  fulfilled_at       timestamptz,
  unique (student_id, concept_id)
);
create index review_schedules_due_idx
  on review_schedules (due_at) where fulfilled_at is null;

create table escalations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  student_id      uuid references users(id) on delete cascade,
  classroom_id    uuid references classrooms(id) on delete cascade,
  kind            escalation_kind not null,
  -- 設計書8.4の介入優先度
  priority        intervention_priority not null default 'medium',
  title           text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          escalation_status not null default 'open',
  resolved_by     uuid references users(id),
  resolution_note text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index escalations_queue_idx
  on escalations (tenant_id, status, priority, created_at);

-- 承認が要る全アクションの単一入口。
-- 教材の正式公開 / クラス一斉配信 / 成績反映 / 重要な介入 / 低確信度の評価。
create table approvals (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  resource_type    approval_resource not null,
  resource_id      uuid not null,
  requested_by     text not null default 'agent',
  -- エージェントが何をしようとしているか。再現可能な形で持つ。
  proposal         jsonb not null default '{}'::jsonb,
  decision         approval_decision,
  decided_by       uuid references users(id),
  decided_at       timestamptz,
  modified_payload jsonb,
  reject_reason    text,
  created_at       timestamptz not null default now()
);
create index approvals_pending_idx
  on approvals (tenant_id, resource_type, created_at) where decision is null;
create index approvals_resource_idx on approvals (resource_type, resource_id);
