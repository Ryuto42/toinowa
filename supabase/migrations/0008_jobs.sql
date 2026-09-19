-- 非同期ジョブ基盤。
--
-- なぜ pgmq ではなく自前テーブルか:
--   ・ダッシュボードから中身が見えないと、デモ当日に「なぜ止まったか」を説明できない
--   ・ステップの途中結果を持つ列が必要で、結局これと同じ表を別に作ることになる
--   ・run_after による遅延実行と dead-letter の可視化が素直に書ける
--
-- なぜ Vercel Cron ではなく pg_cron か:
--   ・Vercel Hobby の Cron は1日1回。評価60秒SLOを満たせない
--   ・pg_net 経由なら Hobby/Pro 共通で10秒粒度、しかもVercelデプロイ中も止まらない

create table jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  kind            text not null,
  payload         jsonb not null default '{}'::jsonb,
  -- 投入自体を冪等にする。例: 'run_assessment:{assignment_id}:{student_id}:{answers_sha}'
  idempotency_key text not null,
  status          job_status not null default 'queued',
  -- 1が最優先。対話由来のジョブをバッチより先に処理する。
  priority        smallint not null default 5 check (priority between 1 and 9),

  -- ▼ Vercel関数のタイムアウトを構造的に回避する仕組み ▼
  -- 1回の呼び出しで1ステップだけ実行し、途中結果を state に書いて戻る。
  -- 1ステップ15秒以内に収める限り、300秒上限が制約になることは無い。
  step            text not null default 'start',
  state           jsonb not null default '{}'::jsonb,

  attempt         int not null default 0,
  max_attempts    int not null default 5,
  run_after       timestamptz not null default now(),
  -- リース方式。プラットフォームに殺されても何も書かれず、失効で次のtickが拾い直す。
  -- タイムアウトとクラッシュが同じ復旧経路になるので、実際に動く。
  locked_until    timestamptz,
  lease_token     uuid,
  last_error      text,
  trace_id        uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (kind, idempotency_key)
);
create index jobs_claim_idx on jobs (priority, run_after)
  where status in ('queued','leased');
create index jobs_tenant_idx on jobs (tenant_id, created_at desc);

-- dead-letter。管理画面から中身を見て再投入できるようにする。
create table jobs_dead (like jobs including defaults);
alter table jobs_dead add primary key (id);
alter table jobs_dead add column died_at timestamptz not null default now();
create index jobs_dead_tenant_idx on jobs_dead (tenant_id, died_at desc);

-- ジョブの取得。
-- FOR UPDATE SKIP LOCKED が、同時に走る複数のVercel呼び出しを安全にする要。
-- これが無いと2つのworkerが同じジョブを掴んで二重評価が起きる。
create or replace function claim_jobs(p_limit int default 5, p_lease_sec int default 90)
returns setof jobs
language sql volatile
set search_path = ''
as $$
  update public.jobs j set
    status       = 'leased',
    locked_until = now() + make_interval(secs => p_lease_sec),
    lease_token  = gen_random_uuid(),
    -- 期限切れリースを回収したときだけ試行回数を増やす。
    -- 正常なステップ進行では増やさない（ステップ数だけ再試行を消費しないため）。
    attempt      = case when j.status = 'leased' then j.attempt + 1 else j.attempt end,
    updated_at   = now()
  where j.id in (
    select id from public.jobs
    where (status = 'queued' and run_after <= now())
       or (status = 'leased' and locked_until < now())
    order by priority, run_after
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;
revoke all on function claim_jobs(int, int) from anon, authenticated;

-- 上限到達したジョブを dead-letter へ移す。
create or replace function fail_job_permanently(p_job_id uuid, p_error text)
returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  insert into public.jobs_dead
  select j.*, now() from public.jobs j where j.id = p_job_id;

  update public.jobs_dead set last_error = p_error, status = 'dead'
  where id = p_job_id;

  delete from public.jobs where id = p_job_id;
end;
$$;
revoke all on function fail_job_permanently(uuid, text) from anon, authenticated;
