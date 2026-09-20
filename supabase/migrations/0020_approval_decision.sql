create function public.decide_learning_approval(p_tenant uuid, p_actor uuid, p_approval uuid, p_decision text, p_reason text default '', p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.approvals; v_role public.user_role; v_student uuid; v_classroom uuid; v_lesson uuid;
begin
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  select role into v_role from public.users where id=p_actor and tenant_id=p_tenant and status='active';
  if v_role is null or v_role not in ('teacher','admin') then raise exception 'forbidden'; end if;
  select * into a from public.approvals where id=p_approval and tenant_id=p_tenant for update;
  if not found then raise exception 'approval not found'; end if;
  if a.resource_type='assignment' then
    select student_id,classroom_id,lesson_id into v_student,v_classroom,v_lesson from public.assignments where id=a.resource_id and tenant_id=p_tenant;
  elsif a.resource_type='assessment' then
    select student_id into v_student from public.assessments where id=a.resource_id and tenant_id=p_tenant;
  elsif a.resource_type='plan' then
    select student_id into v_student from public.learning_plans where id=a.resource_id and tenant_id=p_tenant;
  else raise exception 'unsupported resource'; end if;
  if v_role='teacher' and not exists (
    select 1 from public.enrollments t where t.tenant_id=p_tenant and t.user_id=p_actor and t.role='teacher' and t.active
      and (t.classroom_id=v_classroom or exists(select 1 from public.enrollments s where s.classroom_id=t.classroom_id and s.user_id=v_student and s.role='student' and s.active))
  ) then raise exception 'student out of scope'; end if;
  if a.decision is not null then
    if a.decision::text=p_decision then return to_jsonb(a); end if;
    raise exception 'already decided';
  end if;
  if a.resource_type='assignment' then
    update public.assignments set status=case when p_decision='approved' then 'published'::public.assignment_status else 'cancelled'::public.assignment_status end,
      due_at=coalesce(p_due_at,due_at),approved_by=p_actor,published_at=case when p_decision='approved' then now() end where id=a.resource_id and tenant_id=p_tenant;
    if p_decision='approved' then update public.lessons set status='published' where id=v_lesson and tenant_id=p_tenant; end if;
  elsif a.resource_type='assessment' then
    update public.assessments set reviewer_status=p_decision::public.review_status,reviewed_by=p_actor,reviewed_at=now() where id=a.resource_id and tenant_id=p_tenant;
  elsif a.resource_type='plan' then
    update public.learning_plans set status=case when p_decision='approved' then 'approved'::public.plan_status else 'superseded'::public.plan_status end,
      approved_by=p_actor,approved_at=now() where id=a.resource_id and tenant_id=p_tenant;
  end if;
  update public.approvals set decision=p_decision::public.approval_decision,decided_by=p_actor,decided_at=now(),reject_reason=p_reason where id=a.id returning * into a;
  insert into public.audit_logs(tenant_id,actor_id,actor_role,action,resource_type,resource_id,result,detail)
    values(p_tenant,p_actor,v_role,'approval.decide',a.resource_type::text,a.resource_id,'allow',jsonb_build_object('decision',p_decision));
  return to_jsonb(a);
end $$;
revoke all on function public.decide_learning_approval(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.decide_learning_approval(uuid,uuid,uuid,text,text,timestamptz) to service_role;
