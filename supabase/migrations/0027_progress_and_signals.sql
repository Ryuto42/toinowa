-- 課題の開封状態・滞在時間・回答ごとの所要時間・AI文章判定の記録場所。

-- ── 1. 生徒ごとの進捗 ──────────────────────────────────────────
-- assignments はクラス一斉配信だと1行を複数生徒が共有するため、
-- 開封状態を assignments.status に持たせられない。生徒ごとの行を別に持つ。
create type work_progress as enum ('not_started', 'in_progress', 'completed');

create table assignment_progress (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  assignment_id  uuid not null references assignments(id) on delete cascade,
  student_id     uuid not null references users(id) on delete cascade,
  status         work_progress not null default 'not_started',
  opened_at      timestamptz,
  completed_at   timestamptz,
  -- 画面を開いていた実時間の累計。タブが背面のときは加算しない
  -- （開きっぱなしを学習時間として数えないため）。
  active_seconds int not null default 0,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index assignment_progress_student_idx on assignment_progress (student_id, status);
create index assignment_progress_assignment_idx on assignment_progress (assignment_id);

alter table assignment_progress enable row level security;
alter table assignment_progress force row level security;

create policy assignment_progress_read on assignment_progress for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(student_id))
    )
  );

-- 書き込みはAPI（service_role）経由のみ。生徒が自分の進捗を偽装できないようにする。
grant select on table public.assignment_progress to authenticated;
grant select, insert, update on table public.assignment_progress to service_role;

-- ── 2. 回答ごとの計測値とAI判定 ────────────────────────────────
-- time_spent_sec は 0004 で既にある。書き込む側が無かったので今回から埋める。
alter table answers
  add column typing_ms     int,          -- 実際にキーを打っていた時間
  add column paste_count   int not null default 0,
  add column keystrokes    int,
  -- 0..1。高いほどAI生成らしい。判定できなかった場合は null。
  add column ai_likelihood numeric(4,3) check (ai_likelihood between 0 and 1),
  -- {heuristic:{...}, llm:{...}, verdict:'low'|'medium'|'high'}
  add column ai_signals    jsonb not null default '{}'::jsonb;

create index answers_ai_flagged_idx on answers (tenant_id, answered_at desc)
  where ai_likelihood >= 0.7;

-- ── 3. 介入の種類にAI疑いを追加 ────────────────────────────────
-- 同じトランザクション内でこの値を使うとエラーになるため、ここでは追加のみ。
alter type escalation_kind add value if not exists 'ai_suspected';
