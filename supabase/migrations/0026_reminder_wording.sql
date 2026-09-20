-- 復習リマインダーの文言をプロダクトの現在の呼称に合わせる。
--
-- 0012 では「確認問題」だったが、プロダクトが「説明ワーク」に変わった。
-- 適用済みの 0012 を書き換えると、ファイルとDBが食い違ったままになるため
-- （db-push が sha256 で検出して止まる）、ここで再スケジュールして上書きする。

select cron.unschedule('enqueue-review-reminders');
select cron.schedule(
  'enqueue-review-reminders',
  '*/15 * * * *',
  $$
  insert into public.notifications
    (tenant_id, student_id, kind, title, body, href, scheduled_for)
  select r.tenant_id, r.student_id, 'review_due',
         '復習のタイミングです',
         c.name || ' の説明ワークが用意できました。',
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
