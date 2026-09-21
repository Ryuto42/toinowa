-- リース照合を行わない旧RPCの実行権限を廃止する。
--
-- fail_job_permanently は job_id だけでジョブを消すため、リース期限切れで
-- 別のワーカーが拾い直した後に古いワーカーが失敗を報告すると、実行中の
-- ジョブを消してしまう。0024 で lease_token を照合する fail_leased_job を
-- 用意したので、旧RPCは呼べないようにする。
--
-- 定義自体は残す（既存の参照が即座に壊れないようにするため）。
-- なお 0024 は dev 側にも同名ファイルがあり、この revoke だけが欠けていた。
-- 0024 は適用済みで台帳のsha256と一致しているため編集せず、差分をここへ切り出す。

revoke all on function public.fail_job_permanently(uuid, text) from public, anon, authenticated, service_role;
