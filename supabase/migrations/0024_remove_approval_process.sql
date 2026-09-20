-- 承認プロセスの廃止。
--
-- 背景: AI評価を先生が承認してから確定させる運用をやめ、分析結果はその場で確定する。
-- 画面・API・ジョブ側の起票は削除済み。ここでは既存データの整合を取る。
--
-- 0022 は student_first_login が使っているため 0024 に採番している。



-- ── 1. 確認待ちのまま残っている評価を確定済みにする ──────────────
-- overridden（先生が上書きしたもの）は残す。上書きは承認プロセスではなく訂正機能で、
-- 引き続き使う。
update public.assessments
   set reviewer_status = 'auto_approved'
 where reviewer_status = 'pending_review';

-- ── 2. 承認待ちのまま止まっている学習計画を有効化する ────────────
update public.learning_plans
   set status = 'active'
 where status = 'pending_review';

-- ── 3. 承認キューの中身を空にする ────────────────────────────
-- テーブル自体は残す。approval_resource / approval_decision enum を含めて
-- 落とすと依存関係の解体が必要になり、得られるものに対してリスクが高い。
-- 書き込むコードが無くなったので、以降は空のままになる。
delete from public.approvals;

-- ── 4. 復習リマインダーの文言を現在の呼称に合わせる ───────────────
-- 0012 では「確認問題」だった。プロダクトの呼称が「説明ワーク」に変わったため、
-- 0012 を書き換えるのではなく、ここで再スケジュールして上書きする。
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
