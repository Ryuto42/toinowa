-- 音声入力のトークンを別に数える。
--
-- OrcaRouter は音声を含むリクエストに usage.cost_usd を返さない（実測）。
-- 費用を推定するにも、発話時間を出すにも、音声ぶんを分けて持つ必要がある。
alter table public.agent_runs
  add column if not exists audio_input_tokens integer not null default 0;
