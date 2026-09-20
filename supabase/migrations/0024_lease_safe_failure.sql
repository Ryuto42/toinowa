-- リース所有者だけがジョブを dead-letter へ送れるようにする。
--
-- fail_job_permanently は job_id だけで消すため、リースが期限切れして
-- 別のワーカーが拾い直した後に、元のワーカーが遅れて失敗を報告すると
-- 実行中のジョブを消してしまう。
-- lease_token が現在の所有者と一致するときだけ処理する版を用意する。
--
-- ※ このファイルは一度失われ、稼働中のDBの定義から復元した。
--   （適用は 2026-09-20 17:02。0024 は remove_approval_process と番号が重複しているが、
--    ファイル名順＝実際の適用順になっているため、そのままにしている）

create or replace function public.fail_leased_job(
  p_job_id uuid, p_lease_token uuid, p_error text
) returns boolean
language plpgsql
set search_path = ''
as $$
declare current_job public.jobs;
begin
  select * into current_job from public.jobs
    where id = p_job_id and status = 'leased' and lease_token = p_lease_token
    for update;
  -- 既に別のワーカーが拾い直している。何もせず false を返す。
  if not found then return false; end if;
  insert into public.jobs_dead select j.*, now() from public.jobs j where j.id = p_job_id;
  update public.jobs_dead set last_error = left(p_error, 2000), status = 'dead' where id = p_job_id;
  delete from public.jobs where id = p_job_id and lease_token = p_lease_token;
  return true;
end;
$$;

revoke all on function public.fail_leased_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_leased_job(uuid, uuid, text) to service_role;
