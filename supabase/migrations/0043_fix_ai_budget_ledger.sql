-- 本日のAI予算がいつまでも $0.0000 のままだった原因を直す。
--
-- bump_ai_budget は security definer ではないので service_role として実行され、
-- ai_budget_ledger の連番（id）のシーケンスに USAGE が無くて毎回
-- 「permission denied for sequence」で落ちていた。
-- 呼び出し側（record.ts）が RPC のエラーを見ていなかったため、
-- 記録が1件も入らないまま画面には 0 が出続けていた。
--
-- あわせて「本日」を Asia/Tokyo に揃える。current_date は UTC の日付なので、
-- 日本時間の朝9時に予算がリセットされてしまい、1日の区切りが実感と合わない。

grant usage on sequence public.ai_budget_ledger_id_seq to service_role;
grant usage on sequence public.workflow_transitions_id_seq to service_role;

create or replace function public.bump_ai_budget(
  p_tenant uuid, p_scope text, p_scope_id uuid, p_cost numeric
)
returns void
language sql volatile security definer
set search_path = ''
as $$
  insert into public.ai_budget_ledger (tenant_id, scope, scope_id, day, spent_usd, request_count)
  values (p_tenant, p_scope, p_scope_id, (now() at time zone 'Asia/Tokyo')::date, coalesce(p_cost, 0), 1)
  on conflict (scope, scope_id, day) do update
    set spent_usd     = public.ai_budget_ledger.spent_usd + coalesce(p_cost, 0),
        request_count = public.ai_budget_ledger.request_count + 1;
$$;
revoke all on function public.bump_ai_budget(uuid, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.bump_ai_budget(uuid, text, uuid, numeric) to service_role;

create or replace function public.today_ai_spend(p_tenant uuid)
returns numeric
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(spent_usd), 0)
  from public.ai_budget_ledger
  where tenant_id = p_tenant and scope = 'tenant'
    and day = (now() at time zone 'Asia/Tokyo')::date;
$$;
revoke all on function public.today_ai_spend(uuid) from public, anon, authenticated;
grant execute on function public.today_ai_spend(uuid) to service_role;

-- これまでの実行記録から台帳を作り直す。費用は agent_runs に残っているので、
-- 過去の日別の消費も正しく出せる。
insert into public.ai_budget_ledger (tenant_id, scope, scope_id, day, spent_usd, request_count)
select tenant_id, 'tenant', tenant_id, (created_at at time zone 'Asia/Tokyo')::date,
       coalesce(sum(estimated_cost_usd), 0), count(*)
from public.agent_runs
group by tenant_id, (created_at at time zone 'Asia/Tokyo')::date
on conflict (scope, scope_id, day) do nothing;

insert into public.ai_budget_ledger (tenant_id, scope, scope_id, day, spent_usd, request_count)
select tenant_id, 'student', student_id, (created_at at time zone 'Asia/Tokyo')::date,
       coalesce(sum(estimated_cost_usd), 0), count(*)
from public.agent_runs
where student_id is not null
group by tenant_id, student_id, (created_at at time zone 'Asia/Tokyo')::date
on conflict (scope, scope_id, day) do nothing;
