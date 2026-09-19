-- 通知。LINEが入るまでの復習リマインダー経路（アプリ内通知 + Web Push）。
-- LINE実装時は delivered_channels に 'line' が増えるだけで、生成側は変わらない。

create table notifications (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  student_id         uuid not null references users(id) on delete cascade,
  kind               notification_kind not null,
  title              text not null,
  body               text not null,
  href               text,
  payload            jsonb not null default '{}'::jsonb,
  -- 生徒の notification_settings.preferred_time までまとめて保持する。
  -- 無制限に送らないこと自体が要件（設計書20.3）。
  scheduled_for      timestamptz not null default now(),
  delivered_channels channel[] not null default '{}',
  delivered_at       timestamptz,
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);
create index notifications_student_idx
  on notifications (student_id, created_at desc);
create index notifications_pending_idx
  on notifications (scheduled_for) where delivered_at is null;

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  failed_at  timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id)
  where failed_at is null;

-- 先生からのお知らせ（生徒ホームに出る）
create table announcements (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete cascade,
  author_id    uuid not null references users(id) on delete cascade,
  body         text not null,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);
create index announcements_classroom_idx
  on announcements (classroom_id, published_at desc);
