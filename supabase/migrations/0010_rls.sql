-- 認可。4層防御の最後の砦。
--
-- 設計方針:
--   ・JWTカスタムクレームには「低頻度更新・低カーディナリティ」のものだけ入れる
--     → tenant_id と role。担任クラス一覧は名簿変更で即古くなるので入れない
--   ・クラス範囲は STABLE SECURITY DEFINER のヘルパ関数で解決する
--     → STABLE でないと候補行ごとに再実行され、クラス分析クエリが数千行で崩れる
--   ・エージェントが書く表には authenticated 向けの INSERT/UPDATE ポリシーを作らない
--     → 生徒はアプリにバグがあっても理解度スコアを偽造できない

-- ════════════════════════════════════════════════════════════
-- Custom Access Token Hook
-- Dashboard → Authentication → Hooks で有効化すること。
-- 関数名にアプリ名を含めない（アプリ名は変更される前提のため）。
-- ════════════════════════════════════════════════════════════
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
  select tenant_id, role, status into u
  from public.users where id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

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

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;
grant all on table public.users to supabase_auth_admin;

-- ════════════════════════════════════════════════════════════
-- ポリシーヘルパ（private スキーマ = PostgREST から呼べない）
-- ════════════════════════════════════════════════════════════
create or replace function private.current_tenant() returns uuid
language sql stable
set search_path = ''
as $$ select nullif(auth.jwt() ->> 'tenant_id', '')::uuid $$;

create or replace function private.current_role() returns text
language sql stable
set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'app_role', 'none') $$;

-- SECURITY DEFINER にするのは、enrollments 自身のポリシーへ再帰しないため。
-- STABLE にするのは、1文につき1回だけ評価させるため（性能上の要）。
create or replace function private.my_classrooms() returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select classroom_id from public.enrollments
  where user_id = auth.uid() and active
$$;

-- 先生が「その生徒を見てよいか」。担当クラスに在籍しているかで判定する。
create or replace function private.teaches_student(p_student uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.user_id = p_student
      and e.role = 'student'
      and e.active
      and e.classroom_id in (select private.my_classrooms())
  )
$$;

revoke all on function private.current_tenant()      from anon, authenticated;
revoke all on function private.current_role()        from anon, authenticated;
revoke all on function private.my_classrooms()       from anon, authenticated;
revoke all on function private.teaches_student(uuid) from anon, authenticated;
grant execute on function private.current_tenant()      to authenticated;
grant execute on function private.current_role()        to authenticated;
grant execute on function private.my_classrooms()       to authenticated;
grant execute on function private.teaches_student(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- RLS 有効化（force = テーブル所有者にも適用）
-- ════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','school_codes','users','student_profiles','classrooms','enrollments',
    'line_account_links','channel_link_tokens',
    'lessons','materials','concepts','material_chunks','questions','assignments','answers',
    'conversations','messages','teacher_questions',
    'assessments','learning_plans','review_schedules','escalations','approvals',
    'agent_runs','agent_run_attempts','guard_events','workflow_runs','workflow_transitions',
    'audit_logs','ai_budget_ledger','model_disables',
    'jobs','jobs_dead','notifications','push_subscriptions','announcements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
-- 1. 完全非公開（service role のみ。ポリシーを一切作らない）
--    エージェントとworkerだけが書く表、および内部キュー。
--    先生向けの観測画面はAPIルート経由で読む（Supabaseクライアントから直接読ませない）。
-- ════════════════════════════════════════════════════════════
--   jobs, jobs_dead, agent_runs, agent_run_attempts, guard_events,
--   workflow_runs, workflow_transitions, audit_logs, ai_budget_ledger,
--   channel_link_tokens, model_disables
-- → ポリシー無し = RLS有効下で authenticated からは0行に見える。

-- ════════════════════════════════════════════════════════════
-- 2. 学校コードだけは未ログインでも引けないと、ログイン画面が成立しない。
--    テナントIDすら返さず、コードの存在確認だけができれば十分。
-- ════════════════════════════════════════════════════════════
create policy school_codes_lookup on school_codes
  for select to anon, authenticated using (active);

-- ════════════════════════════════════════════════════════════
-- 3. 自分のテナント配下のみ（共通の土台）
-- ════════════════════════════════════════════════════════════
create policy tenants_self on tenants for select to authenticated
  using (id = private.current_tenant());

create policy classrooms_scope on classrooms for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (private.current_role() = 'admin' or id in (select private.my_classrooms()))
  );

create policy enrollments_scope on enrollments for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      user_id = auth.uid()
      or private.current_role() = 'admin'
      or classroom_id in (select private.my_classrooms())
    )
  );

-- ════════════════════════════════════════════════════════════
-- 4. ユーザー / プロフィール
-- ════════════════════════════════════════════════════════════
create policy users_scope on users for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(id))
    )
  );

create policy student_profiles_read on student_profiles for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      user_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(user_id))
    )
  );

-- 生徒が変更してよいのは自分の設定だけ。
-- ただし学校方針でロックされた項目はアプリ層の guard() が弾く
-- （RLSは「誰の行か」までしか見ない）。
create policy student_profiles_self_update on student_profiles for update to authenticated
  using (user_id = auth.uid() and tenant_id = private.current_tenant())
  with check (user_id = auth.uid() and tenant_id = private.current_tenant());

-- ════════════════════════════════════════════════════════════
-- 5. 授業・教材・概念・問題（先生が書き、生徒は公開済みだけ読む）
-- ════════════════════════════════════════════════════════════
create policy lessons_read on lessons for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and classroom_id in (select private.my_classrooms())
    and (private.current_role() <> 'student' or status = 'published')
  );

create policy lessons_teacher_write on lessons for all to authenticated
  using (
    tenant_id = private.current_tenant()
    and private.current_role() in ('teacher','admin')
    and classroom_id in (select private.my_classrooms())
  )
  with check (
    tenant_id = private.current_tenant()
    and private.current_role() in ('teacher','admin')
    and classroom_id in (select private.my_classrooms())
  );

create policy materials_teacher on materials for all to authenticated
  using (
    tenant_id = private.current_tenant()
    and private.current_role() in ('teacher','admin')
    and lesson_id in (select id from lessons)
  )
  with check (
    tenant_id = private.current_tenant()
    and private.current_role() in ('teacher','admin')
  );

create policy concepts_read on concepts for select to authenticated
  using (tenant_id = private.current_tenant() and lesson_id in (select id from lessons));

create policy concepts_teacher_write on concepts for all to authenticated
  using (
    tenant_id = private.current_tenant()
    and private.current_role() in ('teacher','admin')
    and lesson_id in (select id from lessons)
  )
  with check (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'));

-- 教材チャンクは生徒に直接読ませない。根拠表示はAPI経由で必要な断片だけ返す。
create policy material_chunks_teacher on material_chunks for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and private.current_role() in ('teacher','admin')
    and lesson_id in (select id from lessons)
  );

create policy questions_read on questions for select to authenticated
  using (tenant_id = private.current_tenant() and concept_id in (select id from concepts));

create policy questions_teacher_write on questions for all to authenticated
  using (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'))
  with check (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'));

-- ════════════════════════════════════════════════════════════
-- 6. 課題・回答
-- ════════════════════════════════════════════════════════════
create policy assignments_read on assignments for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher'
          and (classroom_id in (select private.my_classrooms())
               or private.teaches_student(student_id)))
    )
  );

create policy assignments_teacher_write on assignments for all to authenticated
  using (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'))
  with check (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'));

create policy answers_read on answers for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(student_id))
    )
  );

-- 生徒は自分の回答を提出できる。更新・削除はできない（改ざん防止）。
create policy answers_student_insert on answers for insert to authenticated
  with check (student_id = auth.uid() and tenant_id = private.current_tenant());

-- ════════════════════════════════════════════════════════════
-- 7. 会話・メッセージ
--    チャネルで絞らない。Web と LINE が1本のスレッドとして読めることが要件。
-- ════════════════════════════════════════════════════════════
create policy conversations_read on conversations for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(student_id))
    )
  );

create policy messages_read on messages for select to authenticated
  using (tenant_id = private.current_tenant() and conversation_id in (select id from conversations));

create policy teacher_questions_read on teacher_questions for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(student_id))
    )
  );

create policy teacher_questions_student_insert on teacher_questions for insert to authenticated
  with check (student_id = auth.uid() and tenant_id = private.current_tenant());

create policy teacher_questions_teacher_update on teacher_questions for update to authenticated
  using (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'))
  with check (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'));

-- ════════════════════════════════════════════════════════════
-- 8. 評価・計画（読み取りのみ。書き込みは service role だけ）
--    先生の「AI評価の上書き」も、監査行とセットで書く必要があるため
--    API経由（service role）で行う。ここに UPDATE ポリシーは置かない。
-- ════════════════════════════════════════════════════════════
create policy assessments_read on assessments for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(student_id))
    )
  );

create policy learning_plans_read on learning_plans for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(student_id))
    )
  );

create policy review_schedules_read on review_schedules for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and private.teaches_student(student_id))
    )
  );

-- 介入と承認は先生・管理者のもの。生徒には見せない。
create policy escalations_teacher on escalations for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and private.current_role() in ('teacher','admin')
    and (student_id is null or private.teaches_student(student_id)
         or private.current_role() = 'admin')
  );

create policy approvals_teacher on approvals for select to authenticated
  using (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'));

-- ════════════════════════════════════════════════════════════
-- 9. 通知・お知らせ・LINE連携
-- ════════════════════════════════════════════════════════════
create policy notifications_self on notifications for select to authenticated
  using (student_id = auth.uid() and tenant_id = private.current_tenant());

create policy notifications_self_update on notifications for update to authenticated
  using (student_id = auth.uid() and tenant_id = private.current_tenant())
  with check (student_id = auth.uid() and tenant_id = private.current_tenant());

create policy push_subscriptions_self on push_subscriptions for all to authenticated
  using (user_id = auth.uid() and tenant_id = private.current_tenant())
  with check (user_id = auth.uid() and tenant_id = private.current_tenant());

create policy announcements_read on announcements for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and classroom_id in (select private.my_classrooms())
    and (private.current_role() <> 'student' or published_at is not null)
  );

create policy announcements_teacher_write on announcements for all to authenticated
  using (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'))
  with check (tenant_id = private.current_tenant() and private.current_role() in ('teacher','admin'));

-- 連携状態は自分の分だけ。line_user_id は暗号化列なので読めても意味を成さない。
create policy line_links_self on line_account_links for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (student_id = auth.uid() or private.current_role() = 'admin')
  );
