-- 監査で見つかった穴をまとめて塞ぐ。

-- ── 1. 学校コードの匿名列挙を止める ──────────────────────────
-- これまでのポリシーは USING (active) だけで、公開キーがあれば
-- 全テナントの学校コードを一覧できた。学校コードはログインの3要素の1つなので、
-- 列挙できると実質2要素に落ちる。
-- ログイン時の突き合わせは service_role（サーバー側）で行うようにしたので、
-- anon の読み取りは不要になった。
drop policy if exists school_codes_lookup on public.school_codes;
create policy school_codes_own_tenant on public.school_codes for select to authenticated
  using (tenant_id = private.current_tenant());
revoke select on table public.school_codes from anon;

-- ── 2. ログインの総当たり対策 ────────────────────────────────
-- ログインIDは student1, student2… と連番で推測できるため、
-- 回数制限が無いと総当たりが成立する。
create table private.login_attempts (
  id  bigserial primary key,
  key text not null,
  at  timestamptz not null default now()
);
create index login_attempts_key_idx on private.login_attempts (key, at desc);
revoke all on table private.login_attempts from public, anon, authenticated, service_role;

/**
 * 直近の失敗回数を返す。成功したら同じ鍵の記録を消す。
 * 鍵は「所属コード+ID」や「IPアドレス」など、呼び出し側が決める。
 */
create or replace function public.register_login_attempt(p_key text, p_success boolean)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  -- 古い記録は溜め込まない（監査は audit_logs 側に残る）
  delete from private.login_attempts where at < now() - interval '1 hour';
  if p_success then
    delete from private.login_attempts where key = p_key;
    return 0;
  end if;
  insert into private.login_attempts(key) values (p_key);
  select count(*) into v_count from private.login_attempts
   where key = p_key and at > now() - interval '10 minutes';
  return v_count;
end $$;
revoke all on function public.register_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.register_login_attempt(text, boolean) to service_role;

/** 記録を増やさずに、いまの失敗回数だけを見る。 */
create or replace function public.login_attempt_count(p_key text)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from private.login_attempts
   where key = p_key and at > now() - interval '10 minutes';
$$;
revoke all on function public.login_attempt_count(text) from public, anon, authenticated;
grant execute on function public.login_attempt_count(text) to service_role;

-- ── 3. force RLS の取りこぼし ────────────────────────────────
-- 他の33テーブルと条件を揃える。所有者でもポリシーを迂回できないようにする。
alter table public.exam_analyses force row level security;
alter table public.lesson_preparations force row level security;

-- ── 4. 生徒1人あたりのAI予算 ─────────────────────────────────
-- テナント日次予算だけだと、1人の生徒が連投して学校全体の枠を使い切れる。
create or replace function public.today_student_ai_spend(p_tenant uuid, p_student uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(spent_usd), 0)
  from public.ai_budget_ledger
  where tenant_id = p_tenant and scope = 'student' and scope_id = p_student
    and day = (now() at time zone 'Asia/Tokyo')::date;
$$;
revoke all on function public.today_student_ai_spend(uuid, uuid) from public, anon, authenticated;
grant execute on function public.today_student_ai_spend(uuid, uuid) to service_role;
