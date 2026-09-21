-- プロンプトキャッシュの再利用量を記録する。
-- 入力トークンのうち何割がキャッシュから返ったかが分かると、
-- 「プロンプトの並べ方を変えた効果」を数字で確認できる。
alter table public.agent_runs add column if not exists cached_input_tokens integer not null default 0;
