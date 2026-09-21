-- 管理者がクラスを作り、生徒と先生を紐付けられるようにする。
--
-- これが無いと、新しく作った先生は enrollments に行が無いため
-- private.my_classrooms() が空を返し、担当クラスも生徒もお題も一切見えない。
-- （create_explanation_work も "actor out of scope" で弾く）

-- クラスの作成・更新はAPI（service_role）経由でのみ行う。
grant insert, update on table public.classrooms to service_role;

-- 管理者は全クラスを一覧できる必要がある。
-- 0010 のポリシーは「自分が在籍するクラス」しか許していないため、管理者を明示する。
drop policy if exists classrooms_scope on public.classrooms;
create policy classrooms_scope on public.classrooms for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (private.current_role() = 'admin' or id in (select private.my_classrooms()))
  );

-- 管理者はテナント内の全在籍を見られるようにする（紐付け画面で現状を出すため）。
drop policy if exists enrollments_scope on public.enrollments;
create policy enrollments_scope on public.enrollments for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      user_id = auth.uid()
      or private.current_role() = 'admin'
      or classroom_id in (select private.my_classrooms())
    )
  );

-- クラスの担当・在籍をまとめて設定する。
-- 1トランザクションで「外す人を active=false に、入れる人を upsert」する。
-- 行を消さずに active を倒すのは、過去の課題・評価が在籍を前提にしているため。
create or replace function public.set_classroom_members(
  p_tenant uuid, p_actor uuid, p_classroom uuid,
  p_teachers uuid[], p_students uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.users
                 where id = p_actor and tenant_id = p_tenant and role = 'admin' and status = 'active') then
    raise exception 'actor must be an active admin';
  end if;
  if not exists (select 1 from public.classrooms where id = p_classroom and tenant_id = p_tenant) then
    raise exception 'classroom out of scope';
  end if;
  -- 指定された利用者が同じテナントに属しているか確認する
  if exists (
    select 1 from unnest(coalesce(p_teachers, '{}') || coalesce(p_students, '{}')) as t(id)
    where not exists (select 1 from public.users u
                      where u.id = t.id and u.tenant_id = p_tenant and u.status = 'active')
  ) then
    raise exception 'member out of scope';
  end if;

  -- 今回の指定から外れた人を無効化
  update public.enrollments set active = false
  where tenant_id = p_tenant and classroom_id = p_classroom and active
    and user_id <> all (coalesce(p_teachers, '{}') || coalesce(p_students, '{}'));

  -- 先生
  insert into public.enrollments (tenant_id, classroom_id, user_id, role, active)
  select p_tenant, p_classroom, t.id, 'teacher', true
  from unnest(coalesce(p_teachers, '{}')) as t(id)
  on conflict (classroom_id, user_id)
    do update set role = 'teacher', active = true;

  -- 生徒
  insert into public.enrollments (tenant_id, classroom_id, user_id, role, active)
  select p_tenant, p_classroom, s.id, 'student', true
  from unnest(coalesce(p_students, '{}')) as s(id)
  on conflict (classroom_id, user_id)
    do update set role = 'student', active = true;
end $$;

revoke all on function public.set_classroom_members(uuid, uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.set_classroom_members(uuid, uuid, uuid, uuid[], uuid[]) to service_role;
