-- ── 1. 学校コードは管理者だけに見せる ──────────────────────────
--
-- 生徒・先生がこの表を読む理由は無い。ログインの突き合わせは
-- service_role（/api/auth/login）で行い、画面で使うのは
-- 管理者のユーザー登録・パスワード再発行だけ。
--
-- 実害は小さいが、他人の所属の学校コードまで一覧できる状態を
-- 「ログインの3要素のうち1つ」として残しておく理由が無い。
drop policy if exists school_codes_own_tenant on public.school_codes;
create policy school_codes_admin_read on public.school_codes for select to authenticated
  using (tenant_id = private.current_tenant() and private.current_role() = 'admin');

-- ── 2. 外部キーの索引 ──────────────────────────────────────
--
-- 親行を消すとき、索引が無い子表は毎回の全表走査になる。
-- 退会・クラス削除・テナント削除がデータ量に比例して重くなるのを避ける。
create index if not exists school_codes_tenant_idx        on public.school_codes (tenant_id);
create index if not exists student_profiles_tenant_idx    on public.student_profiles (tenant_id);
create index if not exists enrollments_tenant_idx         on public.enrollments (tenant_id);
create index if not exists channel_link_tokens_tenant_idx on public.channel_link_tokens (tenant_id);
create index if not exists channel_link_tokens_student_idx on public.channel_link_tokens (student_id);
