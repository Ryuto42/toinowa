-- Supabase 既定の広すぎる権限を外す。
--
-- 初期状態では public スキーマの全テーブルに `grant all` が当たっており、
-- anon / authenticated が TRUNCATE・TRIGGER・REFERENCES を持ったままになる。
--
-- **TRUNCATE は RLS を迂回する。** 行単位のポリシーをどれだけ書いても、
-- TRUNCATE ならテーブルごと空にできる。PostgREST はこの文を投げないので
-- 現状の経路からは到達しないが、権限として残しておく理由が無い。
--
-- TRIGGER は自作の関数をテーブルに仕掛けられる権限で、
-- 他人の書き込みを起点に任意の処理を走らせる足場になりうる。
-- REFERENCES も同様に、こちらから渡す必要がない。
--
-- 読み書き（select/insert/update/delete）は各マイグレーションで
-- 必要な表にだけ付けているので、ここでは触らない。

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- 今後追加されるテーブルにも同じ既定が付かないようにする。
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
