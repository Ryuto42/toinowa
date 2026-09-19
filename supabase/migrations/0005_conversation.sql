-- 会話。Web と LINE を別システムにせず、同じ表・同じサービスで扱う。
-- スレッド取得クエリは channel で絞らない（LINE行がまだ存在しないだけ）。

create table conversations (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,
  student_id              uuid not null references users(id) on delete cascade,
  channel                 channel not null,
  -- Web: session id / LINE: line_user_id の HMAC
  external_thread_id      text,
  lesson_id               uuid references lessons(id) on delete set null,
  concept_id              uuid references concepts(id) on delete set null,
  state                   conv_state not null default 'active',
  -- 長い会話は要約してコンテキストを圧縮する。
  -- 無料枠にはプロンプトトークン上限があるため、これはコスト最適化ではなく動作要件。
  summary                 text,
  summarized_through_seq  int not null default 0,
  message_count           int not null default 0,
  started_at              timestamptz not null default now(),
  completed_at            timestamptz
);
create index conversations_student_idx
  on conversations (student_id, state, started_at desc);

create table messages (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  conversation_id    uuid not null references conversations(id) on delete cascade,
  seq                int not null,
  actor              msg_actor not null,
  -- PIIマスク済みの本文。復号可能な原文カラムは作らない（設計書18.4）。
  -- マスクは DB 書き込み前かつモデル呼び出し前に行う。
  content_redacted   text not null,
  -- チャネル側のメッセージID。webhook の冪等性判定に使う。
  channel_message_id text,
  channel            channel not null default 'web',
  delivery_status    text not null default 'sent'
                     check (delivery_status in ('pending','sent','delivered','failed')),
  safety_flags       jsonb not null default '{}'::jsonb,
  agent_run_id       uuid,
  created_at         timestamptz not null default now(),
  unique (conversation_id, seq)
);
create unique index messages_channel_dedupe_idx
  on messages (tenant_id, channel_message_id)
  where channel_message_id is not null;
create index messages_conversation_idx on messages (conversation_id, seq);

-- 生徒が「先生に聞く」を押したときの引き継ぎ。
create table teacher_questions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  student_id      uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  concept_id      uuid references concepts(id) on delete set null,
  body            text not null,
  answered_by     uuid references users(id),
  answer_body     text,
  answered_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index teacher_questions_open_idx
  on teacher_questions (tenant_id, created_at) where answered_at is null;
