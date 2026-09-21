-- 任意の学習時間と、画面を離れても継続する模試分析。
alter table public.student_profiles alter column daily_time_limit_min drop not null;
alter table public.student_profiles alter column daily_time_limit_min drop default;
create table public.exam_analyses (
 id uuid primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 created_by uuid not null references public.users(id) on delete cascade,
 student_id uuid references public.users(id) on delete cascade,
 status text not null default 'uploading' check(status in ('uploading','queued','processing','completed','failed')),
 images jsonb,
 baseline jsonb not null default '{}',
 result jsonb,
 error_message text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.exam_analyses enable row level security;
grant all on public.exam_analyses to service_role;
revoke all on public.exam_analyses from anon, authenticated;
create index exam_analyses_tenant_created on public.exam_analyses(tenant_id,created_at desc);
alter table public.student_profiles add column exam_analysis_id uuid references public.exam_analyses(id) on delete set null;

-- 全ロールのパスワード再発行と変更の競合検知用。
alter table public.users add column password_revision int not null default 0;
alter table public.users add column password_operation_until timestamptz;
create function public.begin_password_reset(p_tenant uuid,p_actor uuid,p_user uuid)
returns int language plpgsql security definer set search_path='' as $$
declare revision int;
begin
 if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and role='admin' and status='active' and not must_change_password) then raise exception 'actor out of scope'; end if;
 update public.users set must_change_password=true,password_revision=password_revision+1,password_operation_until=now()+interval '5 minutes' where id=p_user and tenant_id=p_tenant and (password_operation_until is null or password_operation_until<now()) returning password_revision into revision;
 if not found then raise exception 'user not found'; end if;
 return revision;
end $$;
revoke all on function public.begin_password_reset(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_password_reset(uuid,uuid,uuid) to service_role;

create function public.attach_exam_analysis(p_tenant uuid,p_actor uuid,p_student uuid,p_analysis uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.exam_analyses;
begin
 if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and role='admin' and status='active' and not must_change_password) then raise exception 'actor out of scope'; end if;
 if not exists(select 1 from public.users where id=p_student and tenant_id=p_tenant and role='student') then raise exception 'student out of scope'; end if;
 insert into public.exam_analyses(id,tenant_id,created_by) values(p_analysis,p_tenant,p_actor) on conflict(id) do nothing;
 select * into a from public.exam_analyses where id=p_analysis for update;
 if a.tenant_id<>p_tenant or a.created_by<>p_actor or (a.student_id is not null and a.student_id<>p_student) then raise exception 'analysis out of scope'; end if;
 update public.exam_analyses set student_id=p_student where id=p_analysis;
 update public.student_profiles set exam_analysis_id=p_analysis where user_id=p_student and tenant_id=p_tenant;
end $$;
revoke all on function public.attach_exam_analysis(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.attach_exam_analysis(uuid,uuid,uuid,uuid) to service_role;

-- 空欄またはアップロード開始時と同じ値だけ更新する。新しい分析や手入力を上書きしない。
create function public.apply_exam_analysis(p_tenant uuid,p_analysis uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.exam_analyses;
begin
 select * into a from public.exam_analyses where id=p_analysis and tenant_id=p_tenant for update;
 if not found or a.status<>'completed' or a.student_id is null then return null; end if;
 update public.student_profiles set
  learning_goal=case when learning_goal=coalesce(a.baseline->>'learningGoal','') then coalesce(nullif(a.result->>'learningGoal',''),learning_goal) else learning_goal end,
  weak_areas=case when weak_areas=coalesce(a.baseline->>'weakAreas','') then coalesce(nullif(a.result->>'weakAreas',''),weak_areas) else weak_areas end,
  exam_results=case when exam_results=coalesce(a.baseline->>'examResults','') then coalesce(nullif(a.result->>'text',''),exam_results) else exam_results end,
  daily_time_limit_min=case when daily_time_limit_min is not distinct from (a.baseline->>'dailyTimeLimitMin')::int then coalesce((a.result->>'dailyTimeLimitMin')::int,daily_time_limit_min) else daily_time_limit_min end
 where user_id=a.student_id and tenant_id=p_tenant and exam_analysis_id=p_analysis;
 if not found then return null; end if;
 return a.student_id;
end $$;
revoke all on function public.apply_exam_analysis(uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_exam_analysis(uuid,uuid) to service_role;

create function public.queue_exam_analysis(p_tenant uuid,p_actor uuid,p_analysis uuid,p_images jsonb,p_baseline jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare a public.exam_analyses;
begin
 if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and role='admin' and status='active' and not must_change_password) then raise exception 'actor out of scope'; end if;
 insert into public.exam_analyses(id,tenant_id,created_by) values(p_analysis,p_tenant,p_actor) on conflict(id) do nothing;
 select * into a from public.exam_analyses where id=p_analysis for update;
 if a.tenant_id<>p_tenant or a.created_by<>p_actor then raise exception 'analysis out of scope'; end if;
 if a.status<>'uploading' then return; end if;
 update public.exam_analyses set images=p_images,baseline=p_baseline,status='queued' where id=p_analysis;
 insert into public.jobs(tenant_id,kind,idempotency_key,payload,priority,max_attempts,trace_id)
 values(p_tenant,'analyze_exam','exam:'||p_analysis::text,jsonb_build_object('analysisId',p_analysis),1,3,gen_random_uuid()) on conflict(kind,idempotency_key) do nothing;
end $$;
revoke all on function public.queue_exam_analysis(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.queue_exam_analysis(uuid,uuid,uuid,jsonb,jsonb) to service_role;

create function public.begin_password_change(p_tenant uuid,p_user uuid)
returns int language plpgsql security definer set search_path='' as $$
declare revision int;
begin
 update public.users set password_revision=password_revision+1,password_operation_until=now()+interval '5 minutes'
 where id=p_user and tenant_id=p_tenant and status='active' and (password_operation_until is null or password_operation_until<now()) returning password_revision into revision;
 if not found then raise exception 'password operation in progress'; end if;
 return revision;
end $$;
revoke all on function public.begin_password_change(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_password_change(uuid,uuid) to service_role;
