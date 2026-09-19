-- 教材・概念・問題・課題・回答。

create table lessons (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  title        text not null,
  taught_at    date,
  objectives   jsonb not null default '[]'::jsonb,
  status       lesson_status not null default 'draft',
  created_by   uuid not null references users(id),
  created_at   timestamptz not null default now()
);
create index lessons_classroom_idx on lessons (classroom_id, taught_at desc);

-- 教材は「教師が任意で提供する」もの。未提供でも成立する設計にする
-- （概念のルーブリックと生徒の入力文から検索する）。
create table materials (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  lesson_id      uuid references lessons(id) on delete cascade,
  storage_path   text not null,
  filename       text not null,
  mime_type      text not null,
  byte_size      bigint,
  -- 取り込みの冪等キー。同じ内容を二重にチャンク化しない。
  content_sha256 bytea,
  ingest_status  text not null default 'pending'
                 check (ingest_status in ('pending','processing','done','failed','quarantined')),
  ingest_error   text,
  created_by     uuid not null references users(id),
  created_at     timestamptz not null default now()
);
create index materials_lesson_idx on materials (lesson_id);

create table concepts (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  lesson_id                uuid not null references lessons(id) on delete cascade,
  name                     text not null,
  description              text,
  prerequisite_concept_ids uuid[] not null default '{}',
  -- {levels:[{level,descriptor,indicators[]}], misconceptions:[{code,label,signal}]}
  -- 教材が無いときはこれが評価と検索の根拠になる。
  rubric                   jsonb not null default '{}'::jsonb,
  order_index              int not null default 0,
  created_at               timestamptz not null default now()
);
create index concepts_lesson_idx on concepts (lesson_id, order_index);

-- 教材チャンク。
-- 埋め込みの次元は src/lib/rag/embed.ts の EMBEDDING_DIMS と必ず一致させること。
-- 埋め込み手段が使えない場合でも、concept_ids と全文検索だけで検索は成立する。
create table material_chunks (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  material_id     uuid not null references materials(id) on delete cascade,
  lesson_id       uuid references lessons(id) on delete cascade,
  concept_ids     uuid[] not null default '{}',
  chunk_index     int not null,
  -- 本文は常に「データ」であり「命令」ではない。
  -- system プロンプトへ連結してはならない（<material_excerpt> で囲んで user ロールへ）。
  content         text not null,
  token_count     int not null default 0,
  embedding       vector(1536),
  embedding_model text,
  -- 取り込み時のインジェクション検査結果。フラグが立っている間は検索対象外。
  safety_flags    jsonb not null default '{}'::jsonb,
  quarantined     bool not null default false,
  created_at      timestamptz not null default now(),
  unique (material_id, chunk_index)
);
create index material_chunks_embedding_idx on material_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index material_chunks_scope_idx on material_chunks (tenant_id, lesson_id);
create index material_chunks_concepts_idx on material_chunks using gin (concept_ids);
-- 埋め込みが使えない場合の代替検索路。日本語は simple 設定で bigram 的に効かせる。
create index material_chunks_fts_idx on material_chunks
  using gin (to_tsvector('simple', content));

create table questions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  concept_id          uuid not null references concepts(id) on delete cascade,
  difficulty          smallint not null check (difficulty between 1 and 5),
  format              question_format not null,
  body                text not null,
  choices             jsonb,
  expected_answer     jsonb,
  grading_rubric      jsonb,
  -- 3段のヒント。3段目も「答え」ではなく「方法」であること。
  -- ヒント文が正答文字列と一致しないことをサーバ側で後検査する。
  hints               jsonb not null default '[]'::jsonb,
  -- 理解度の「類題への転移」成分（重み .15）に入るかどうか
  is_transfer         bool not null default false,
  source_agent_run_id uuid,
  approved_by         uuid references users(id),
  approved_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index questions_concept_idx on questions (concept_id, difficulty);

create table assignments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  lesson_id    uuid not null references lessons(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete cascade,
  -- null ならクラス一斉配信 → 先生の承認が必須（設計書11章）
  student_id   uuid references users(id) on delete cascade,
  question_ids uuid[] not null,
  kind         assignment_kind not null default 'initial',
  status       assignment_status not null default 'draft',
  due_at       timestamptz,
  published_at timestamptz,
  approved_by  uuid references users(id),
  created_at   timestamptz not null default now(),
  constraint assignment_target_ck
    check (student_id is not null or classroom_id is not null)
);
create index assignments_student_idx on assignments (student_id, status, due_at);
create index assignments_lesson_idx on assignments (lesson_id, status);

create table answers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  assignment_id   uuid references assignments(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  student_id      uuid not null references users(id) on delete cascade,
  conversation_id uuid,
  raw_answer      text not null,
  reasoning_text  text,
  -- ヒント梯子の段数はサーバ側の真実。Web と LINE で食い違わせない。
  hint_level      smallint not null default 0 check (hint_level between 0 and 3),
  -- 理解度の「自己評価の較正」成分（重み .10）
  self_rating     smallint check (self_rating between 1 and 5),
  time_spent_sec  int,
  answered_at     timestamptz not null default now()
);
create index answers_student_question_idx
  on answers (student_id, question_id, answered_at desc);
create index answers_assignment_idx on answers (assignment_id);
