-- 氏名と生徒プロフィールを同じトランザクションで更新する。
create function public.edit_managed_user(p_tenant uuid, p_actor uuid, p_user uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.users%rowtype; profile jsonb;
begin
  if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and role='admin' and status='active' and not must_change_password) then
    raise exception 'actor out of scope';
  end if;
  select * into target from public.users where id=p_user and tenant_id=p_tenant for update;
  if not found then raise exception 'user not found'; end if;
  if p_patch ? 'profile' and target.role <> 'student' then raise exception 'student profile required'; end if;
  if p_patch ? 'loginIdentifier' and target.role <> 'student' then raise exception 'student login required'; end if;
  if p_patch ? 'loginIdentifier' and p_patch->>'loginIdentifier' is null and target.email is null then raise exception 'login identifier required'; end if;
  if p_user=p_actor and p_patch ? 'status' and p_patch->>'status'<>'active' then raise exception 'cannot suspend self'; end if;
  update public.users set
    display_name=case when p_patch ? 'displayName' then p_patch->>'displayName' else display_name end,
    login_identifier=case when p_patch ? 'loginIdentifier' then p_patch->>'loginIdentifier' else login_identifier end,
    status=case when p_patch ? 'status' then (p_patch->>'status')::public.user_status else status end
  where id=p_user and tenant_id=p_tenant;
  if p_patch ? 'profile' then
    profile := p_patch->'profile';
    insert into public.student_profiles(user_id,tenant_id,grade,learning_goal,exam_results,weak_areas,daily_time_limit_min)
    values(p_user,p_tenant,profile->>'grade',profile->>'learningGoal',profile->>'examResults',profile->>'weakAreas',(profile->>'dailyTimeLimitMin')::int)
    on conflict(user_id) do update set grade=excluded.grade,learning_goal=excluded.learning_goal,exam_results=excluded.exam_results,weak_areas=excluded.weak_areas,daily_time_limit_min=excluded.daily_time_limit_min;
  end if;
end $$;
revoke all on function public.edit_managed_user(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edit_managed_user(uuid,uuid,uuid,jsonb) to service_role;
