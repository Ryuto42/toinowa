-- ログイン画面からの所属の新規申請。
--
-- テナント・所属コード・管理者ユーザーの3件は、ひとつでも欠けると
-- 「ログインできない所属」や「主が居ない所属コード」が残る。必ず同じ取引で入れる。
--
-- 認証ユーザーの作成だけは SQL では行えないため、呼び出し側が先に auth.users を作り、
-- その id をここへ渡す。この関数が失敗したら呼び出し側が認証ユーザーを消す。
--
-- 予算は既定の 20.00 ではなく 1.00 で始める。
-- 誰でも作れる入口なので、確認前の所属が使える金額は小さくしておく。

create or replace function public.provision_tenant(
  p_code        text,
  p_name        text,
  p_admin_id    uuid,
  p_admin_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  -- citext の主キーなので大文字小文字は区別しない。
  if exists (select 1 from public.school_codes where code = p_code) then
    raise exception 'code_taken' using errcode = 'P0001';
  end if;

  insert into public.tenants (name, ai_budget_limit_usd)
  values (p_name, 1.00)
  returning id into v_tenant;

  insert into public.school_codes (code, tenant_id, active)
  values (p_code, v_tenant, true);

  insert into public.users (id, tenant_id, role, display_name, email, must_change_password, status)
  values (p_admin_id, v_tenant, 'admin', '管理者', p_admin_email, true, 'active');

  return v_tenant;
end $$;

revoke all on function public.provision_tenant(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.provision_tenant(text, text, uuid, text) to service_role;

/**
 * 申請しようとしているコードが空いているか。
 *
 * 申請そのものを試させる前に答えるためだけの関数で、
 * コードが使われているかどうか以外は何も返さない（所属名もIDも晒さない）。
 */
create or replace function public.school_code_available(p_code text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$ select not exists (select 1 from public.school_codes where code = p_code) $$;

revoke all on function public.school_code_available(text) from public, anon, authenticated;
grant execute on function public.school_code_available(text) to service_role;
