-- 生徒の引き継ぎ（先生から先生へ）。
--
-- 「介入」は AI が自動で上げる対応待ち案件。こちらは先生が自分の意思で、
-- 担当変更・代講・進級のときに次の先生へ申し送るための記録で、別のものとして扱う。
--
-- 受け取る先生はまだその生徒を担当していないのが普通なので、
-- 閲覧条件に teaches_student は使えない。当事者（送り手・受け手）と管理者に限る。
--
-- 引き継いだ時点の理解度や課題は後から変わる。あとで「何を見て引き継いだのか」を
-- 追えるよう、そのときの要約を snapshot に凍結して残す。

create type handoff_status as enum ('pending', 'accepted', 'declined', 'cancelled');
create type handoff_reason as enum ('class_change', 'substitute', 'promotion', 'consult', 'other');

create table handoffs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  student_id    uuid not null references users(id) on delete cascade,
  from_user     uuid not null references users(id) on delete cascade,
  to_user       uuid not null references users(id) on delete cascade,
  classroom_id  uuid references classrooms(id) on delete set null,
  reason        handoff_reason not null default 'other',
  note          text not null,
  snapshot      jsonb not null default '{}'::jsonb,
  status        handoff_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  response_note text,
  constraint handoffs_distinct_teachers check (from_user <> to_user)
);
create index handoffs_inbox_idx   on handoffs (tenant_id, to_user, status, created_at desc);
create index handoffs_outbox_idx  on handoffs (tenant_id, from_user, created_at desc);
create index handoffs_student_idx on handoffs (tenant_id, student_id, created_at desc);

alter table handoffs enable row level security;
alter table handoffs force row level security;

create policy handoffs_party_read on handoffs for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      private.current_role() = 'admin'
      or from_user = auth.uid()
      or to_user = auth.uid()
    )
  );

-- 書き込みはAPI（service_role）経由のみ。送り手・受け手の妥当性はAPIで確認する。
grant select on table public.handoffs to authenticated;
