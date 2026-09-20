-- 古いworkerが再取得済みのジョブを削除できないよう、リース所有権を行ロック下で照合する。
create or replace function public.fail_leased_job(p_job_id uuid, p_lease_token uuid, p_error text)
returns boolean language plpgsql volatile set search_path = '' as $$
declare current_job public.jobs;
begin
  select * into current_job from public.jobs
    where id = p_job_id and status = 'leased' and lease_token = p_lease_token
    for update;
  if not found then return false; end if;
  insert into public.jobs_dead select j.*, now() from public.jobs j where j.id = p_job_id;
  update public.jobs_dead set last_error = left(p_error, 2000), status = 'dead' where id = p_job_id;
  delete from public.jobs where id = p_job_id and lease_token = p_lease_token;
  return true;
end;
$$;
revoke all on function public.fail_leased_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_leased_job(uuid, uuid, text) to service_role;
-- 旧RPCはリース照合を行わないため、実行権限を廃止する（互換性のため定義は残す）。
revoke all on function public.fail_job_permanently(uuid, text) from public, anon, authenticated, service_role;
