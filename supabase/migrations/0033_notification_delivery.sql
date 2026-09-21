-- 通知をブラウザのプッシュで配信するジョブを定期的に積む。
--
-- 通知行を作るところ（enqueue-review-reminders）までは動いていたが、
-- 送信するコードもジョブも無かったため、push_subscriptions は
-- 登録されるだけで一度も使われていなかった。
--
-- 実際の送信はワーカー側（deliver_notifications ハンドラ）が行う。
-- ここでは「未配信の通知がある学校の分だけ」ジョブを積む。

create or replace function private.enqueue_notification_delivery() returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  insert into public.jobs (tenant_id, kind, idempotency_key, payload, priority, run_after)
  select distinct
         n.tenant_id,
         'deliver_notifications',
         'deliver_notifications:' || n.tenant_id || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
         '{}'::jsonb,
         7,
         now()
  from public.notifications n
  where n.delivered_at is null
    and n.scheduled_for <= now()
  on conflict (kind, idempotency_key) do nothing;
end;
$$;
revoke all on function private.enqueue_notification_delivery() from anon, authenticated;

select cron.schedule(
  'enqueue-notification-delivery',
  '*/5 * * * *',
  $$ select private.enqueue_notification_delivery(); $$
);
