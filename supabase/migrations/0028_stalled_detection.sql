-- 学習停滞・未着手の検知（設計書8.4「中」）。
--
-- アプリ側のジョブにしないのは、この判定が「何も起きていないこと」を
-- 見つけるものだから。生徒の操作を起点にできないので、時間で回す。

create or replace function private.detect_stalled_work() returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  -- ① 期限を過ぎても一度も開いていない
  insert into public.escalations (tenant_id, student_id, classroom_id, kind, priority, title, payload)
  select a.tenant_id, e.user_id, a.classroom_id, 'stalled', 'medium',
         coalesce(l.title, '説明ワーク') || ' が未着手のままです',
         jsonb_build_object('assignmentId', a.id, 'dueAt', a.due_at, 'reason', 'never_opened')
  from public.assignments a
  join public.enrollments e
    on e.classroom_id = a.classroom_id and e.role = 'student' and e.active
  left join public.lessons l on l.id = a.lesson_id
  left join public.assignment_progress p
    on p.assignment_id = a.id and p.student_id = e.user_id
  where a.status = 'published'
    and a.due_at is not null
    and a.due_at < now()
    and (a.student_id is null or a.student_id = e.user_id)
    and (p.id is null or p.status = 'not_started')
    -- 同じ生徒の未対応の停滞案件が既にあれば作らない
    and not exists (
      select 1 from public.escalations x
      where x.tenant_id = a.tenant_id and x.student_id = e.user_id
        and x.kind = 'stalled' and x.status in ('open', 'acknowledged')
        and x.created_at > now() - interval '72 hours'
    );

  -- ② 開いたが3日以上進んでいない
  insert into public.escalations (tenant_id, student_id, classroom_id, kind, priority, title, payload)
  select p.tenant_id, p.student_id, a.classroom_id, 'stalled', 'medium',
         coalesce(l.title, '説明ワーク') || ' が途中で止まっています',
         jsonb_build_object('assignmentId', a.id, 'openedAt', p.opened_at,
                            'lastSeenAt', p.last_seen_at, 'activeSeconds', p.active_seconds,
                            'reason', 'no_progress')
  from public.assignment_progress p
  join public.assignments a on a.id = p.assignment_id
  left join public.lessons l on l.id = a.lesson_id
  where p.status = 'in_progress'
    and p.last_seen_at < now() - interval '3 days'
    and not exists (
      select 1 from public.escalations x
      where x.tenant_id = p.tenant_id and x.student_id = p.student_id
        and x.kind = 'stalled' and x.status in ('open', 'acknowledged')
        and x.created_at > now() - interval '72 hours'
    );
end;
$$;
revoke all on function private.detect_stalled_work() from anon, authenticated;

-- 毎日 07:30 JST（= 22:30 UTC）。朝に先生が確認できるタイミングへ寄せる。
select cron.schedule('detect-stalled-work', '30 22 * * *', $$ select private.detect_stalled_work(); $$);
