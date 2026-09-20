-- create_explanation_work から承認キューへの書き込みを外す。
--
-- 0019 では p_publish=false のときに approvals へ起票していたが、
-- 承認プロセスを廃止した（0024）ため、このままだと空にしたキューへ
-- 再び行が積まれてしまう。
--
-- あわせて未公開時のステータスを pending_approval から draft に変える。
-- 「承認待ち」という状態がもう存在しないので、名前が実態と合わない。

create or replace function public.create_explanation_work(
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
    values(p_tenant,v_lesson,p_classroom,p_student,array[v_question],
      case when p_publish then 'published'::public.assignment_status else 'draft'::public.assignment_status end,
      case when p_publish then now() end,case when p_publish and p_student is null then p_actor end,p_plan,p_due_at) returning id into v_assignment;
  return v_assignment;
end $$;

-- 承認待ちのまま残っている課題を下書きに寄せる（承認する手段がもう無いため）。
update public.assignments set status = 'draft' where status = 'pending_approval';
