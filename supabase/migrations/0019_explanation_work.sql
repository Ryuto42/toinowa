alter table public.assignments add column source_plan_id uuid references public.learning_plans(id) on delete set null;
create unique index assignments_source_plan_idx on public.assignments(source_plan_id) where source_plan_id is not null;

-- 同級生の個別課題や、未承認のお題を生徒へ公開しない。
drop policy assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated using (
  tenant_id = private.current_tenant() and (
    (private.current_role() = 'student' and status in ('published', 'completed') and (
      student_id = auth.uid() or (student_id is null and classroom_id in (select private.my_classrooms()))
    ))
    or private.current_role() = 'admin'
    or (private.current_role() = 'teacher' and (
      classroom_id in (select private.my_classrooms()) or private.teaches_student(student_id)
    ))
  )
);

-- お題と付随データを1トランザクションで保存。公開権限は呼び出し元で検証。
create function public.create_explanation_work(
  p_tenant uuid, p_actor uuid, p_classroom uuid, p_title text, p_body text,
  p_content text, p_difficulty integer, p_student uuid default null,
  p_plan uuid default null, p_publish boolean default false, p_due_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_lesson uuid; v_concept uuid; v_question uuid; v_assignment uuid;
begin
  if p_difficulty not between 1 and 5 or length(trim(p_title)) not between 1 and 200
     or length(trim(p_body)) not between 1 and 4000 or length(p_content) > 20000 then
    raise exception 'invalid work input';
  end if;
  if not exists (select 1 from public.classrooms where id=p_classroom and tenant_id=p_tenant) then
    raise exception 'classroom out of scope';
  end if;
  if not exists (select 1 from public.users u where u.id=p_actor and u.tenant_id=p_tenant and u.status='active' and (
    u.role='admin' or (u.role='teacher' and exists(select 1 from public.enrollments e where e.user_id=u.id and e.classroom_id=p_classroom and e.role='teacher' and e.active))
  )) then raise exception 'actor out of scope'; end if;
  if p_student is not null and not exists (
    select 1 from public.enrollments where tenant_id=p_tenant and user_id=p_student and classroom_id=p_classroom and role='student' and active
  ) then raise exception 'student out of scope'; end if;
  if p_plan is not null then
    perform 1 from public.learning_plans where id=p_plan and tenant_id=p_tenant and student_id=p_student for update;
    if not found then raise exception 'plan out of scope'; end if;
    select id into v_assignment from public.assignments where source_plan_id=p_plan;
    if found then return v_assignment; end if;
  end if;
  insert into public.lessons(tenant_id,classroom_id,title,objectives,status,created_by)
    values(p_tenant,p_classroom,p_title,jsonb_build_array(p_title),case when p_publish then 'published'::public.lesson_status else 'analyzed'::public.lesson_status end,p_actor) returning id into v_lesson;
  insert into public.concepts(tenant_id,lesson_id,name,description,rubric)
    values(p_tenant,v_lesson,p_title,p_content,jsonb_build_object('criteria',jsonb_build_array('概念の核','理由のつながり','具体例','正確さ','伝わりやすさ'))) returning id into v_concept;
  insert into public.questions(tenant_id,concept_id,difficulty,format,body,grading_rubric,approved_by,approved_at)
    values(p_tenant,v_concept,p_difficulty,'explain',p_body,jsonb_build_object('reference',p_content,'criteria',jsonb_build_array('定義','理由','例','正確さ','明瞭さ')),
      case when p_publish and p_student is null then p_actor end,case when p_publish and p_student is null then now() end) returning id into v_question;
  insert into public.assignments(tenant_id,lesson_id,classroom_id,student_id,question_ids,status,published_at,approved_by,source_plan_id,due_at)
    values(p_tenant,v_lesson,p_classroom,p_student,array[v_question],case when p_publish then 'published'::public.assignment_status else 'pending_approval'::public.assignment_status end,
      case when p_publish then now() end,case when p_publish and p_student is null then p_actor end,p_plan,p_due_at) returning id into v_assignment;
  if not p_publish then
    insert into public.approvals(tenant_id,resource_type,resource_id,requested_by,proposal)
      values(p_tenant,'assignment',v_assignment,'curriculum-agent',jsonb_build_object('title',p_title,'body',p_body,'difficulty',p_difficulty));
  end if;
  return v_assignment;
end $$;
revoke all on function public.create_explanation_work(uuid,uuid,uuid,text,text,text,integer,uuid,uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.create_explanation_work(uuid,uuid,uuid,text,text,text,integer,uuid,uuid,boolean,timestamptz) to service_role;
