-- 拡張機能。Supabase ダッシュボードで適用済みだが、再現可能にするため記録する。
create extension if not exists vector;      -- 教材チャンクの埋め込み検索
create extension if not exists pgcrypto;    -- gen_random_uuid / digest / hmac
create extension if not exists citext;      -- メールアドレスの大小文字非依存
create extension if not exists pg_cron;     -- 10秒ごとの worker tick / 夜間パージ
create extension if not exists pg_net;      -- pg_cron から Vercel を叩く HTTP クライアント

-- ポリシーヘルパと内部設定を置くスキーマ。PostgREST には決して露出させない。
create schema if not exists private;
revoke usage on schema private from anon, authenticated;

-- worker secret など、cron のコマンド文に直接書きたくない値の置き場。
-- cron.job のコマンド文は誰でも読めるため、シークレットはここから引く。
create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from anon, authenticated;

-- worker が生きているかの心拍。2分以上古ければ管理画面で警告する。
create table if not exists private.worker_heartbeat (
  id           boolean primary key default true check (id),
  last_tick_at timestamptz not null default now(),
  last_claimed int not null default 0
);
insert into private.worker_heartbeat (id) values (true) on conflict do nothing;
revoke all on private.worker_heartbeat from anon, authenticated;
