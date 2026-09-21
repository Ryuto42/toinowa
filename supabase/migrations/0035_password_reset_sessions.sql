-- 再発行前のセッションを失効し、署名が有効でも古いJWTからのアクセスを止める。
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  u      record;
begin
  select tenant_id, role, status, must_change_password, password_revision into u
  from public.users where id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{password_revision}', to_jsonb(coalesce(u.password_revision,0)));
  claims := jsonb_set(claims, '{must_change_password}', to_jsonb(coalesce(u.must_change_password, false)));

  if u is null or u.status <> 'active' then
    -- fail closed: 停止中・未登録のユーザーには一切の権限を与えない
    claims := jsonb_set(claims, '{app_role}', '"none"');
    claims := claims - 'tenant_id';
  else
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(u.tenant_id::text));
    claims := jsonb_set(claims, '{app_role}',  to_jsonb(u.role::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;


-- 初期パスワードのままでは直接DB APIからも学校データを読めない。
create or replace function private.current_tenant() returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.tenant_id from public.users u
  where u.id = auth.uid() and u.status = 'active' and not u.must_change_password
    and u.password_revision = coalesce((auth.jwt()->>'password_revision')::int,0)
    and u.tenant_id = nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

create or replace function public.begin_password_reset(p_tenant uuid,p_actor uuid,p_user uuid)
returns int language plpgsql security definer set search_path='' as $$
declare revision int;
begin
 if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and role='admin' and status='active' and not must_change_password) then raise exception 'actor out of scope'; end if;
 update public.users set must_change_password=true,password_revision=password_revision+1,password_operation_until=now()+interval '5 minutes' where id=p_user and tenant_id=p_tenant and (password_operation_until is null or password_operation_until<now()) returning password_revision into revision;
 if not found then raise exception 'user not found'; end if;
 delete from auth.refresh_tokens where user_id=p_user::text;
 delete from auth.sessions where user_id=p_user;
 return revision;
end $$;

create or replace function public.begin_password_change(p_tenant uuid,p_user uuid)
returns int language plpgsql security definer set search_path='' as $$
declare revision int;
begin
 update public.users set password_operation_until=now()+interval '5 minutes'
 where id=p_user and tenant_id=p_tenant and status='active' and (password_operation_until is null or password_operation_until<now()) returning password_revision into revision;
 if not found then raise exception 'password operation in progress'; end if;
 return revision;
end $$;
