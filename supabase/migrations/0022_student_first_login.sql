-- 生徒の連絡先メールは不要。Authの内部アドレスはauth.usersだけで管理する。
alter table public.users alter column email drop not null;
alter table public.users add column must_change_password boolean not null default false;

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
  select tenant_id, role, status, must_change_password into u
  from public.users where id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
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
    and u.tenant_id = nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;
