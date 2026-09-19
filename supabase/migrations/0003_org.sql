-- 組織・アイデンティティ。
-- テナントスコープの表にはすべて tenant_id を非正規化して持たせる。
-- RLSポリシーがテナント判定のために3表JOINしなくて済むようにするため。

create table tenants (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  plan                   text not null default 'standard',
  -- 設計書17.1。夜間の pg_cron がこの日数を実際に履行する（持つだけにしない）
  retention_days         int  not null default 365 check (retention_days between 7 and 3650),
  ai_budget_limit_usd    numeric(10,2) not null default 20.00,
  line_channel_config_id uuid,
  created_at             timestamptz not null default now()
);

-- ログイン画面の「学校コード」から tenant_id を引くための公開テーブル。
-- コードとテナントIDだけを持ち、テナント名すら晒さない。
create table school_codes (
  code      citext primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  active    bool not null default true
);

-- auth.users と 1:1。JWTカスタムクレームの供給元であり、RLSの結合先。
create table users (
  id           uuid primary key references auth.users(id) on delete cascade,
  tenant_id    uuid not null references tenants(id),
  role         user_role not null,
  display_name text not null,
  email        citext not null,
  -- 生徒の場合は「学校コード + 生徒ID」。認証用メールはここから解決時に合成する。
  -- ドメインを login_identifier に焼き込まないのは、アプリ名（＝メールドメイン）を
  -- 後から変更してもログイン不能にならないようにするため。
  login_identifier citext,
  status       user_status not null default 'active',
  created_at   timestamptz not null default now(),
  unique (tenant_id, email)
);
create unique index users_login_identifier_idx
  on users (tenant_id, login_identifier)
  where login_identifier is not null;
create index users_tenant_role_idx on users (tenant_id, role);

create table student_profiles (
  user_id              uuid primary key references users(id) on delete cascade,
  tenant_id            uuid not null references tenants(id),
  grade                text,
  -- 設計書13.2。固定的な能力ラベルではなく「変更可能な学習傾向」として持つ。
  -- 生徒と先生が確認・修正・削除できることが要件。
  learning_preferences jsonb not null default '[]'::jsonb,
  daily_time_limit_min int  not null default 30 check (daily_time_limit_min between 5 and 240),
  notification_settings jsonb not null default
    '{"quiet_hours":{"from":"21:00","to":"07:00"},"preferred_time":"19:00","channels":["web"]}'::jsonb,
  consent_status       jsonb not null default
    '{"ai_use":false,"data_retention_ack":false}'::jsonb,
  current_difficulty   smallint not null default 2 check (current_difficulty between 1 and 5),
  streak_days          int not null default 0,
  last_active_on       date
);

create table classrooms (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  subject    text not null,
  grade      text,
  created_at timestamptz not null default now()
);
create index classrooms_tenant_idx on classrooms (tenant_id);

-- 「生徒がクラスに在籍する」と「先生がクラスを担当する」を1表で表す。
-- RLSは private.my_classrooms() 経由でこの表を1回だけ読む。
create table enrollments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         user_role not null,
  active       bool not null default true,
  created_at   timestamptz not null default now(),
  unique (classroom_id, user_id)
);
create index enrollments_user_idx on enrollments (user_id) where active;
create index enrollments_classroom_role_idx on enrollments (classroom_id, role) where active;

-- LINE連携（M16で使用、テーブルは初日から存在させる）。
--
-- 非自明な点: webhook は平文の lineUserId で到着するが、AES-GCM は IV が毎回異なるため
-- 暗号化列では検索できない。そこで
--   line_user_id_encrypted … 値の保管（AES-256-GCM、認証付き暗号）
--   line_user_id_hmac      … 検索キー（HMAC-SHA256、決定的）
-- の2列を持つ。これを後から気づくと webhook 実装日に詰む。
create table line_account_links (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants(id) on delete cascade,
  student_id             uuid not null references users(id) on delete cascade,
  line_user_id_encrypted bytea,
  line_user_id_hmac      bytea,
  status                 text not null default 'pending'
                         check (status in ('pending','linked','revoked')),
  linked_at              timestamptz,
  revoked_at             timestamptz,
  created_at             timestamptz not null default now()
);
create unique index line_links_hmac_idx
  on line_account_links (tenant_id, line_user_id_hmac)
  where line_user_id_hmac is not null;
create index line_links_student_idx on line_account_links (student_id);

-- 連携コード。Webでログイン済みの生徒にだけ発行し、一度きり・期限付きで使う。
-- 設計書9.2「LINEのユーザー識別子だけで生徒を確定しない」の実装。
create table channel_link_tokens (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  code       text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index channel_link_tokens_lookup_idx
  on channel_link_tokens (code) where used_at is null;
