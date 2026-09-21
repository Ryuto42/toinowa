-- メニューの未確認バッジ。
--
-- 「未対応の件数」ではなく「その人がまだ見ていない件数」を出すための記録。
-- 件数そのものを持たず、最後にそのタブを開いた時刻だけを持つ。
-- 件数を保存すると、あとから対象の定義を変えたときに過去の値が嘘になる。

create table nav_seen (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  nav_key   text not null,
  seen_at   timestamptz not null default now(),
  primary key (user_id, nav_key)
);

create index nav_seen_tenant_idx on nav_seen (tenant_id, user_id);

alter table nav_seen enable row level security;
alter table nav_seen force row level security;

-- 自分の既読状態だけ。他人の閲覧状況は誰にも見せない（管理者にも）。
create policy nav_seen_own_read on nav_seen for select to authenticated
  using (tenant_id = private.current_tenant() and user_id = auth.uid());

-- 書き込みはAPI（service_role）経由のみ。
grant select on table public.nav_seen to authenticated;
grant select, insert, update on table public.nav_seen to service_role;
