-- サービス名の変更にあわせて、ログイン用の合成メールアドレスのドメインを移す。
--
-- 生徒は「所属コード + 生徒ID」で入るが、内部では
-- {studentId}@{schoolCode}.{AUTH_EMAIL_DOMAIN} を組み立てて認証している
-- （src/lib/shared/env.server.ts）。先生・管理者は画面にこのアドレスを直接入力する。
-- 環境変数だけを変えると既存ユーザーが全員ログインできなくなるため、
-- 保存済みのアドレスも同時に移す。
--
-- auth.identities.email は identity_data からの生成列なので、
-- identity_data 側だけを更新すれば追従する。

update auth.users
   set email = regexp_replace(email, '\.studypilot\.local$', '.toinowa.local')
 where email like '%.studypilot.local';

update auth.identities
   set identity_data = jsonb_set(
         identity_data,
         '{email}',
         to_jsonb(regexp_replace(identity_data->>'email', '\.studypilot\.local$', '.toinowa.local'))
       )
 where identity_data->>'email' like '%.studypilot.local';

update public.users
   set email = regexp_replace(email, '\.studypilot\.local$', '.toinowa.local')
 where email like '%.studypilot.local';
