-- 授業記録を一度保存し、生徒ごとの計画生成を独立したジョブで進める。
create table public.lesson_preparations (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references public.users(id),
  title text not null check(length(title) between 1 and 200),
  content text not null check(length(content) between 1 and 20000),
  due_at timestamptz not null,
  student_ids uuid[] not null,
  created_at timestamptz not null default now()
);
alter table public.lesson_preparations enable row level security;
grant select on public.lesson_preparations to authenticated;
grant all on public.lesson_preparations to service_role;
create policy preparation_read on public.lesson_preparations for select to authenticated using (
  tenant_id=private.current_tenant() and (private.current_role()='admin' or
    exists(select 1 from public.enrollments e where e.tenant_id=lesson_preparations.tenant_id and e.classroom_id=lesson_preparations.classroom_id and e.user_id=auth.uid() and e.role='teacher' and e.active))
);
alter table public.learning_plans add column preparation_id uuid references public.lesson_preparations(id) on delete set null;
alter table public.learning_plans add column classroom_id uuid references public.classrooms(id) on delete set null;
alter table public.learning_plans add column source_assessment_id uuid references public.assessments(id) on delete set null;
alter table public.learning_plans add column review_notes jsonb not null default '[]';
create index preparation_plans_idx on public.learning_plans(preparation_id);
alter table public.assignments add column revision integer not null default 0;
create function private.bump_assignment_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision=old.revision+1; return new; end $$;
create trigger bump_assignment_revision before update on public.assignments for each row execute function private.bump_assignment_revision();

create function public.queue_lesson_preparation(p_tenant uuid,p_actor uuid,p_id uuid,p_classroom uuid,p_title text,p_content text,p_due timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_students uuid[]; v_student uuid; v_existing public.lesson_preparations;
begin
  if not exists(select 1 from public.classrooms where id=p_classroom and tenant_id=p_tenant) or not exists(
    select 1 from public.users u where u.id=p_actor and u.tenant_id=p_tenant and u.status='active' and (u.role='admin' or (u.role='teacher' and exists(
      select 1 from public.enrollments e where e.tenant_id=p_tenant and e.classroom_id=p_classroom and e.user_id=p_actor and e.role='teacher' and e.active)))
  ) then raise exception '担当クラスを選択してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v_existing from public.lesson_preparations where id=p_id;
  if found then
    if v_existing.tenant_id<>p_tenant or v_existing.created_by<>p_actor or v_existing.classroom_id<>p_classroom or v_existing.content<>p_content or v_existing.title<>p_title or v_existing.due_at<>p_due then raise exception '受付内容が変更されています'; end if;
    return p_id;
  end if;
  if p_due<=now() or length(trim(p_content)) not between 1 and 20000 or length(trim(p_title)) not between 1 and 200 then raise exception '授業記録と未来の期限を指定してください'; end if;
  select array_agg(distinct e.user_id order by e.user_id) into v_students from public.enrollments e join public.users u on u.id=e.user_id and u.tenant_id=e.tenant_id
    where e.tenant_id=p_tenant and e.classroom_id=p_classroom and e.role='student' and e.active and u.status='active' and u.role='student';
  if coalesce(cardinality(v_students),0)=0 then raise exception 'クラスに生徒を登録してください'; end if;
  if cardinality(v_students)>100 then raise exception '1回に準備できる生徒は100人までです'; end if;
  insert into public.lesson_preparations(id,tenant_id,classroom_id,created_by,title,content,due_at,student_ids)
    values(p_id,p_tenant,p_classroom,p_actor,p_title,p_content,p_due,v_students);
  foreach v_student in array v_students loop
    insert into public.jobs(tenant_id,kind,idempotency_key,payload,max_attempts,priority)
      values(p_tenant,'prepare_lesson_student',p_id::text||':'||v_student::text,jsonb_build_object('preparationId',p_id,'studentId',v_student,'classroomId',p_classroom,'requestedBy',p_actor),3,6);
  end loop;
  return p_id;
end $$;
revoke all on function public.queue_lesson_preparation(uuid,uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.queue_lesson_preparation(uuid,uuid,uuid,uuid,text,text,timestamptz) to service_role;

-- 一括承認・編集は原子的に行い、画面で確認後に変更された案は配信しない。
create function public.review_explanation_works(p_tenant uuid,p_actor uuid,p_items jsonb,p_publish boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; work public.assignments; q public.questions; n integer:=0; actor_role public.user_role;
begin
  select role into actor_role from public.users where id=p_actor and tenant_id=p_tenant and status='active';
  if actor_role is null or actor_role not in ('admin','teacher') then raise exception '権限がありません'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception '確認する課題を選択してください'; end if;
  for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
    select * into work from public.assignments where id=(item->>'id')::uuid and tenant_id=p_tenant for update;
    if not found then raise exception '課題が見つかりません'; end if;
    if actor_role='teacher' and not exists(select 1 from public.enrollments where tenant_id=p_tenant and classroom_id=work.classroom_id and user_id=p_actor and role='teacher' and active) then raise exception '担当外の課題です'; end if;
    if (item->>'revision') is null or work.revision<>(item->>'revision')::int then raise exception '課題が更新されています。画面を更新して再確認してください'; end if;
    if p_publish and work.status<>'draft' then raise exception '配信済みの課題が含まれています'; end if;
    if length(trim(coalesce(item->>'title',''))) not between 1 and 200 or length(trim(coalesce(item->>'body',''))) not between 1 and 4000 or coalesce((item->>'difficulty')::int,0) not between 1 and 5 or length(coalesce(item->>'content',''))>20000 then raise exception '課題の入力が不正です'; end if;
    if p_publish and (item->>'dueAt' is null or (item->>'dueAt')::timestamptz<=now()) then raise exception '未来の期限を設定してください'; end if;
    select * into q from public.questions where id=work.question_ids[1] and tenant_id=p_tenant;
    if not found then raise exception 'お題が見つかりません'; end if;
    update public.lessons set title=item->>'title',objectives=jsonb_build_array(item->>'title'),status=case when p_publish then 'published'::public.lesson_status else status end where id=work.lesson_id and tenant_id=p_tenant;
    update public.concepts set name=item->>'title',description=coalesce(item->>'content','') where id=q.concept_id and tenant_id=p_tenant;
    update public.questions set body=item->>'body',difficulty=(item->>'difficulty')::int,grading_rubric=jsonb_set(coalesce(grading_rubric,'{}'),'{reference}',to_jsonb(coalesce(item->>'content',''))) where id=q.id and tenant_id=p_tenant;
    update public.assignments set due_at=(item->>'dueAt')::timestamptz,status=case when p_publish then 'published'::public.assignment_status else status end,
      approved_by=case when p_publish then p_actor else approved_by end,published_at=case when p_publish then now() else published_at end where id=work.id;
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.review_explanation_works(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.review_explanation_works(uuid,uuid,jsonb,boolean) to service_role;
