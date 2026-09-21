-- 所属単位の採番。削除・ID編集後も発行済み番号へ戻さない。
create table private.student_login_counters (
 tenant_id uuid primary key references public.tenants(id) on delete cascade,
 last_value numeric not null default 0 check(last_value>=0)
);
revoke all on private.student_login_counters from public,anon,authenticated,service_role;
insert into private.student_login_counters(tenant_id,last_value)
 select tenant_id,max(substring(lower(login_identifier::text) from 8)::numeric)
 from public.users where lower(login_identifier::text) ~ '^student[0-9]{1,33}$'
 group by tenant_id;

create function private.assign_student_login() returns trigger language plpgsql security definer set search_path='' as $$
declare n numeric; identifier text;
begin
 if tg_op='INSERT' and new.role='student' and new.login_identifier is null then
  -- UPSERTの行ロックで、同時登録でも同じ番号を発行しない。
  insert into private.student_login_counters(tenant_id,last_value) values(new.tenant_id,1)
  on conflict(tenant_id) do update set last_value=private.student_login_counters.last_value+1
  returning last_value into n;
  identifier:='student'||n::text;
  if length(identifier)>40 then raise exception '生徒のログインIDの発行上限に達しました'; end if;
  new.login_identifier:=identifier;
 elsif lower(new.login_identifier::text) ~ '^student[0-9]{1,33}$' then
  -- 既存IDの手動変更・データ移行で追加した番号も次の採番に反映する。
  n:=substring(lower(new.login_identifier::text) from 8)::numeric;
  insert into private.student_login_counters(tenant_id,last_value) values(new.tenant_id,n)
  on conflict(tenant_id) do update set last_value=greatest(private.student_login_counters.last_value,excluded.last_value);
 end if;
 return new;
end $$;
revoke all on function private.assign_student_login() from public,anon,authenticated,service_role;
create trigger assign_student_login before insert or update of login_identifier,tenant_id,role on public.users for each row execute function private.assign_student_login();
