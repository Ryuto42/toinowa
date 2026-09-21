-- 新しい計画は生徒だけでなく担当クラスでも絞り込む。
drop policy learning_plans_read on public.learning_plans;
create policy learning_plans_read on public.learning_plans for select to authenticated using (
  tenant_id=private.current_tenant() and (private.current_role()='admin' or
    (private.current_role()='teacher' and (
      (classroom_id is null and private.teaches_student(student_id)) or
      exists(select 1 from public.enrollments e where e.tenant_id=learning_plans.tenant_id and e.classroom_id=learning_plans.classroom_id and e.user_id=auth.uid() and e.role='teacher' and e.active)
    )))
);
-- 失敗分だけ同じジョブIDで再開。保存済みの計画・課題は再生成しない。
create function public.retry_lesson_preparation(p_tenant uuid,p_actor uuid,p_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare prep public.lesson_preparations; j public.jobs_dead; n integer:=0;
begin
  select * into prep from public.lesson_preparations where id=p_id and tenant_id=p_tenant for update;
  if not found or not exists(select 1 from public.users u where u.id=p_actor and u.tenant_id=p_tenant and u.status='active' and (u.role='admin' or (u.role='teacher' and exists(select 1 from public.enrollments e where e.tenant_id=p_tenant and e.user_id=p_actor and e.classroom_id=prep.classroom_id and e.role='teacher' and e.active)))) then raise exception '担当クラスの授業記録を選択してください'; end if;
  for j in select * from public.jobs_dead where tenant_id=p_tenant and kind='prepare_lesson_student' and payload->>'preparationId'=p_id::text for update loop
    insert into public.jobs(id,tenant_id,kind,payload,idempotency_key,status,priority,step,state,attempt,max_attempts,trace_id)
      values(j.id,j.tenant_id,j.kind,j.payload,j.idempotency_key,'queued',j.priority,j.step,j.state,0,j.max_attempts,j.trace_id);
    delete from public.jobs_dead where id=j.id;
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.retry_lesson_preparation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_lesson_preparation(uuid,uuid,uuid) to service_role;
