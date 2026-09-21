-- pg_cron スケジュール。
--
-- ⚠️ 適用前に private.app_config へ worker_url と worker_secret を入れること:
--   insert into private.app_config (key, value) values
--     ('worker_url', 'https://<your-app>.vercel.app/api/internal/worker/tick'),
--     ('worker_secret', '<.env.local の WORKER_SECRET と同じ値>')
--   on conflict (key) do update set value = excluded.value;
--
-- ⚠️ Vercel の Deployment Protection を /api/internal/* で無効化またはバイパス
--    しないと、本番では動きプレビューで全滅する。

-- ── 10秒ごとの worker tick ────────────────────────────────────────────
-- Vercel Cron を使わない理由: Hobby は1日1回で、評価60秒SLOを満たせない。
-- pg_net 経由なら Hobby/Pro 共通で10秒粒度、しかもVercelデプロイ中も止まらない。
select cron.schedule(
  'worker-tick',
  '10 seconds',
  $$
  select net.http_post(
    url     := (select value from private.app_config where key = 'worker_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Worker-Secret', (select value from private.app_config where key = 'worker_secret')),
    body    := '{}'::jsonb,
    -- fire and forget。ジョブの完了を待たない。
    timeout_milliseconds := 5000
  );
  $$
);

-- ── 復習予定 → 通知の生成（15分ごと） ─────────────────────────────────
-- 生徒の通知設定に従ってまとめて配信する。無制限に送らないこと自体が要件。
select cron.schedule(
  'enqueue-review-reminders',
  '*/15 * * * *',
  $$
  insert into public.notifications
    (tenant_id, student_id, kind, title, body, href, scheduled_for)
  select r.tenant_id, r.student_id, 'review_due',
         '復習のタイミングです',
         c.name || ' の確認問題が用意できました。',
         '/student/home',
         -- 生徒が指定した通知時刻の直近の枠へ寄せる
         date_trunc('day', now() at time zone 'Asia/Tokyo')
           + coalesce((sp.notification_settings ->> 'preferred_time')::time, '19:00'::time)
  from public.review_schedules r
  join public.concepts c on c.id = r.concept_id
  join public.student_profiles sp on sp.user_id = r.student_id
  where r.fulfilled_at is null
    and r.due_at <= now()
    and not exists (
      select 1 from public.notifications n
      where n.student_id = r.student_id
        and n.kind = 'review_due'
        and n.created_at > now() - interval '20 hours'
    );
  $$
);

-- ── 保持期間の履行（毎日 03:10 JST = 18:10 UTC） ──────────────────────
-- tenants.retention_days を実際に守る。
-- 持っているのに履行しないフィールドは、無いより悪い。
select cron.schedule(
  'enforce-retention',
  '10 18 * * *',
  $$
  delete from public.messages m
  using public.tenants t
  where m.tenant_id = t.id
    and m.created_at < now() - make_interval(days => t.retention_days);

  delete from public.agent_runs a
  using public.tenants t
  where a.tenant_id = t.id
    and a.created_at < now() - make_interval(days => t.retention_days);

  delete from public.audit_logs l
  using public.tenants t
  where l.tenant_id = t.id
    and l.created_at < now() - make_interval(days => greatest(t.retention_days, 365));

  -- 使われなかった連携トークンは期限切れで即消す
  delete from public.channel_link_tokens
  where used_at is null and expires_at < now() - interval '1 day';
  $$
);

-- ── dead-letter の掃除（毎日 03:40 JST） ──────────────────────────────
select cron.schedule(
  'purge-dead-jobs',
  '40 18 * * *',
  $$ delete from public.jobs_dead where died_at < now() - interval '30 days'; $$
);
