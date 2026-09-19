-- worker-tick は private.app_config に worker_url / worker_secret が
-- 入っていない間、null を url に渡して10秒ごとに失敗し続ける。
-- デプロイ前でも静かにしているよう、設定が揃っているときだけ叩くガードを入れる。
--
-- デプロイ後に下記を実行すれば、そのまま動き出す（再スケジュール不要）:
--   insert into private.app_config (key, value) values
--     ('worker_url',    'https://<your-app>.vercel.app/api/internal/worker/tick'),
--     ('worker_secret', '<.env.local の WORKER_SECRET と同じ値>')
--   on conflict (key) do update set value = excluded.value;

create or replace function private.tick_worker() returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from private.app_config where key = 'worker_url';
  select value into v_secret from private.app_config where key = 'worker_secret';

  -- 未デプロイ・未設定のときは何もしない（cron のログを汚さない）
  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Worker-Secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000   -- fire and forget。ジョブの完了は待たない
  );
end;
$$;
revoke all on function private.tick_worker() from anon, authenticated;

select cron.unschedule('worker-tick');
select cron.schedule('worker-tick', '10 seconds', $$ select private.tick_worker(); $$);
