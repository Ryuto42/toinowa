-- 0044 でログイン時の学校コード照合を service_role 側へ移したが、
-- この表は anon / authenticated にしか SELECT を与えていなかったため、
-- サーバー側から読めずログインが全て失敗していた。
grant select on table public.school_codes to service_role;
