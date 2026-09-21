-- 個別指導も既存の学習・権限スコープを利用する。利用者によるクラス作成は不要。
alter table public.classrooms add column individual_student_id uuid unique references public.users(id) on delete cascade;
alter table public.classrooms add column archived_at timestamptz;
alter table public.users add column archived_at timestamptz;
alter table public.users add column archived_previous_status public.user_status;

create function private.require_admin(p_tenant uuid,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and role='admin' and status='active' and not must_change_password) then raise exception '管理者の権限が必要です'; end if;
end $$;

create function public.set_student_teachers(p_tenant uuid,p_actor uuid,p_student uuid,p_teachers uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform private.require_admin(p_tenant,p_actor);
 perform 1 from public.users where id=p_student and tenant_id=p_tenant and role='student' and archived_at is null for update;
 if not found then raise exception '生徒が見つからないか、アーカイブされています'; end if;
 if exists(select 1 from unnest(coalesce(p_teachers,'{}')) t(id) where not exists(select 1 from public.users where id=t.id and tenant_id=p_tenant and role in ('teacher','admin') and status='active')) then raise exception '有効な担当の先生を選択してください'; end if;
 insert into public.classrooms(tenant_id,name,subject,grade,individual_student_id)
 values(p_tenant,'個別指導','個別学習',(select grade from public.student_profiles where user_id=p_student),p_student)
 on conflict(individual_student_id) do update set grade=excluded.grade returning id into v_id;
 insert into public.enrollments(tenant_id,classroom_id,user_id,role,active) values(p_tenant,v_id,p_student,'student',true)
 on conflict(classroom_id,user_id) do update set active=true;
 update public.enrollments set active=false where classroom_id=v_id and role='teacher' and user_id<>all(coalesce(p_teachers,'{}'));
 insert into public.enrollments(tenant_id,classroom_id,user_id,role,active)
 select p_tenant,v_id,t.id,'teacher',true from (select distinct unnest(coalesce(p_teachers,'{}')) id) t
 on conflict(classroom_id,user_id) do update set active=true,role='teacher';
 return v_id;
end $$;
revoke all on function public.set_student_teachers(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.set_student_teachers(uuid,uuid,uuid,uuid[]) to service_role;

-- 既存の生徒にも個別の学習領域を作る。担当権限は自動で増やさない。
insert into public.classrooms(tenant_id,name,subject,grade,individual_student_id)
 select u.tenant_id,'個別指導','個別学習',p.grade,u.id from public.users u left join public.student_profiles p on p.user_id=u.id where u.role='student';
insert into public.enrollments(tenant_id,classroom_id,user_id,role)
 select tenant_id,id,individual_student_id,'student' from public.classrooms where individual_student_id is not null;

-- 個別領域に別の生徒を追加する操作を禁止する。
alter function public.set_classroom_members(uuid,uuid,uuid,uuid[],uuid[]) set schema private;
create function public.set_classroom_members(p_tenant uuid,p_actor uuid,p_classroom uuid,p_teachers uuid[],p_students uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin(p_tenant,p_actor);
 perform 1 from public.classrooms where id=p_classroom and tenant_id=p_tenant and individual_student_id is null and archived_at is null for share;
 if not found then raise exception '有効なクラスを選択してください'; end if;
 if exists(select 1 from unnest(p_teachers) t(id) where not exists(select 1 from public.users where id=t.id and tenant_id=p_tenant and role in ('teacher','admin') and archived_at is null)) or
 exists(select 1 from unnest(p_students) t(id) where not exists(select 1 from public.users where id=t.id and tenant_id=p_tenant and role='student' and archived_at is null)) then raise exception '担当・生徒の指定が不正です'; end if;
 perform private.set_classroom_members(p_tenant,p_actor,p_classroom,p_teachers,p_students);
end $$;
revoke all on function public.set_classroom_members(uuid,uuid,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.set_classroom_members(uuid,uuid,uuid,uuid[],uuid[]) to service_role;
revoke all on function private.set_classroom_members(uuid,uuid,uuid,uuid[],uuid[]) from public,anon,authenticated,service_role;

-- アーカイブと新規書き込みは同じ行ロックで直列化する。履歴の読み取りは保持する。
create function private.assert_learning_active(p_tenant uuid,p_classroom uuid,p_student uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.classrooms; u public.users;
begin
 if p_student is not null then
  select * into u from public.users where id=p_student and tenant_id=p_tenant for share;
  if not found or u.archived_at is not null or u.status<>'active' then raise exception 'この生徒の学習は停止されています'; end if;
 end if;
 if p_classroom is not null then
  select * into c from public.classrooms where id=p_classroom and tenant_id=p_tenant for share;
  if not found or c.archived_at is not null then raise exception 'このクラスはアーカイブされています'; end if;
  if c.individual_student_id is not null and p_student is not null and c.individual_student_id<>p_student then raise exception '個別指導の対象生徒が異なります'; end if;
  if c.individual_student_id is not null and not exists(select 1 from public.users where id=c.individual_student_id and archived_at is null and status='active') then raise exception 'この生徒の学習は停止されています'; end if;
 end if;
end $$;
create function private.guard_learning_write() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); v_class uuid; v_student uuid; v_lesson uuid;
begin
 v_class:=(j->>'classroom_id')::uuid; v_student:=(j->>'student_id')::uuid; v_lesson:=(j->>'lesson_id')::uuid;
 if tg_table_name='enrollments' then
  if new.role='student' and new.active then
   if exists(select 1 from public.classrooms where id=new.classroom_id and individual_student_id is not null and individual_student_id<>new.user_id) then raise exception '個別指導には他の生徒を登録できません'; end if;
  end if;
  return new;
 end if;
 if j->>'conversation_id' is not null then select lesson_id,student_id into v_lesson,v_student from public.conversations where id=(j->>'conversation_id')::uuid; end if;
 if v_lesson is null and j->>'concept_id' is not null then select lesson_id into v_lesson from public.concepts where id=(j->>'concept_id')::uuid; end if;
 if v_lesson is not null then select classroom_id into v_class from public.lessons where id=v_lesson; end if;
 perform private.assert_learning_active((j->>'tenant_id')::uuid,v_class,v_student);
 if tg_table_name='assignments' and new.student_id is null then select individual_student_id into new.student_id from public.classrooms where id=new.classroom_id; end if;
 return new;
end $$;
create trigger guard_individual_members before insert or update on public.enrollments for each row execute function private.guard_learning_write();
do $$ declare t text; begin
 foreach t in array array['lessons','lesson_preparations','learning_plans','assignments','conversations','messages','answers','assessments'] loop
 execute format('create trigger guard_active_insert before insert on public.%I for each row execute function private.guard_learning_write()',t);
 end loop;
end $$;
create trigger guard_active_publish before update of status,due_at on public.assignments for each row execute function private.guard_learning_write();
create function private.guard_archived_user() returns trigger language plpgsql set search_path='' as $$
begin if new.archived_at is not null and new.status<>'suspended' then raise exception '先にアーカイブから復元してください'; end if; return new; end $$;
create trigger guard_archived_user before update on public.users for each row execute function private.guard_archived_user();

-- 終了したクラスの課題を生徒の画面へ新たに出さない。
create policy assignments_active_student on public.assignments as restrictive for select to authenticated using(
 private.current_role()<>'student' or exists(select 1 from public.classrooms c where c.id=assignments.classroom_id and c.archived_at is null)
);
revoke all on function private.require_admin(uuid,uuid),private.assert_learning_active(uuid,uuid,uuid),private.guard_learning_write(),private.guard_archived_user() from public,anon,authenticated,service_role;
