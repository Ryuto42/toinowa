-- 観測性・ワークフロー・監査・予算。審査基準（コスパ・信頼性・自律性）の根拠になる表。

-- AI呼び出し1回 = 1行。成功・縮退・遮断・エラーのすべての経路で必ず書く。
-- 書き込みは after() 経由の fire-and-forget にして初回トークンの遅延に足さない。
create table agent_runs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  -- 1つのユーザー操作に紐づく複数エージェント実行をまとめる
  trace_id           uuid not null,
  parent_run_id      uuid references agent_runs(id) on delete set null,
  agent_name         text not null,
  request_type       text not null,
  -- 'free' か 'production' か。どちらで動いているか分からない状態を作らない。
  model_tier         text not null default 'free',
  router_name        text not null,
  -- X-Orca-Resolved-Model。.withResponse() で読まないと永久に null になる。
  resolved_model     text,
  -- X-Orca-Request-Id。GET /v1/generation?id= で確定コストを引ける。
  orca_request_id    text,
  input_tokens       int,
  output_tokens      int,
  -- usage.cost_usd（X-OrcaRouter-Include-Cost: true）の実測値。推定ではない。
  estimated_cost_usd numeric(12,6),
  latency_ms         int,
  ttft_ms            int,
  -- X-Orca-Fallback-Level 由来。無料枠切れ(rate_limited)はここに混ぜない。
  fallback_count     int not null default 0,
  schema_valid       bool,
  -- Guardrails / Firewall / 自前Safety層の結果
  safety_result      jsonb not null default '{}'::jsonb,
  tool_calls         jsonb not null default '[]'::jsonb,
  status             agent_run_status not null,
  error_code         text,
  student_id         uuid references users(id) on delete set null,
  conversation_id    uuid references conversations(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index agent_runs_trace_idx on agent_runs (trace_id, created_at);
create index agent_runs_tenant_time_idx on agent_runs (tenant_id, created_at desc);
create index agent_runs_student_idx on agent_runs (tenant_id, student_id, created_at desc);
create index agent_runs_fallback_idx on agent_runs (tenant_id, created_at desc)
  where fallback_count > 0;

-- フォールバック連鎖の各試行。ops画面のウォーターフォール表示に使う。
create table agent_run_attempts (
  id           bigserial primary key,
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  attempt_no   int not null,
  model        text not null,
  outcome      text not null
               check (outcome in ('ok','timeout','error','rate_limited','schema_invalid','blocked')),
  latency_ms   int,
  error_code   text,
  created_at   timestamptz not null default now()
);
create index agent_run_attempts_run_idx on agent_run_attempts (agent_run_id, attempt_no);

-- 遮断イベント。インジェクションを止めたことを見せる画面の元データ。
create table guard_events (
  id              bigserial primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  agent_run_id    uuid references agent_runs(id) on delete set null,
  student_id      uuid references users(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  channel         channel,
  -- 'app_rule' | 'app_classifier' | 'orca_guardrail' | 'orca_firewall'
  source          text not null,
  category        text not null,
  rule            text not null,
  -- 該当箇所だけを抜き出した断片（マスク済み）。全文は保存しない。
  matched_excerpt text,
  -- 実行を拒否したツール。「何をさせなかったか」が説明の核心になる。
  blocked_tools   text[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index guard_events_tenant_idx on guard_events (tenant_id, created_at desc);

-- 設計書11章の自律ワークフロー。
create table workflow_runs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  subject_type      text not null check (subject_type in ('lesson','student_concept')),
  subject_id        uuid not null,
  state             workflow_state not null default 'created',
  state_entered_at  timestamptz not null default now(),
  context           jsonb not null default '{}'::jsonb,
  retry_count       int not null default 0,
  last_error        text,
  created_at        timestamptz not null default now(),
  unique (subject_type, subject_id)
);
create index workflow_runs_state_idx on workflow_runs (tenant_id, state);

create table workflow_transitions (
  id              bigserial primary key,
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  from_state      workflow_state,
  to_state        workflow_state not null,
  trigger         text not null,
  actor           text not null,
  trace_id        uuid,
  created_at      timestamptz not null default now()
);
create index workflow_transitions_run_idx
  on workflow_transitions (workflow_run_id, created_at);

create table audit_logs (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  actor_id      uuid references users(id) on delete set null,
  actor_role    user_role,
  actor_kind    text not null default 'user' check (actor_kind in ('user','agent','system')),
  action        text not null,
  resource_type text not null,
  resource_id   uuid,
  -- 許可も拒否も両方記録する。拒否だけ記録しても攻撃の全体像が見えない。
  result        text not null check (result in ('allow','deny','error')),
  detail        jsonb not null default '{}'::jsonb,
  ip            inet,
  trace_id      uuid,
  created_at    timestamptz not null default now()
);
create index audit_logs_tenant_time_idx on audit_logs (tenant_id, created_at desc);
create index audit_logs_resource_idx on audit_logs (resource_type, resource_id);

-- 予算台帳。free 階層では費用0で件数だけ積み、無料枠の消費を可視化する。
create table ai_budget_ledger (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  scope         text not null check (scope in ('tenant','classroom','student')),
  scope_id      uuid not null,
  day           date not null,
  spent_usd     numeric(12,6) not null default 0,
  request_count int not null default 0,
  unique (scope, scope_id, day)
);
create index ai_budget_ledger_tenant_day_idx on ai_budget_ledger (tenant_id, day desc);

-- デモのキルスイッチ。シミュレーションではなく、callModel() が実際にこの行を見て
-- 該当モデルを連鎖から外す。審査員に問われても偽りが無い。
create table model_disables (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  model       text not null,
  reason      text,
  disabled_by uuid references users(id) on delete set null,
  disabled_at timestamptz not null default now(),
  released_at timestamptz,
  unique (tenant_id, model)
);
create index model_disables_active_idx
  on model_disables (tenant_id) where released_at is null;
