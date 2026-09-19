-- ドメインで固定できる値はすべて enum にする。
-- text + check よりも、取りうる値が型として一覧できることを優先する。

create type user_role         as enum ('student','teacher','admin');
create type user_status       as enum ('active','invited','suspended');

-- チャネルは初日から2値。LINE行がまだ存在しないだけで、
-- 会話サービスもUIもチャネルで分岐しない設計にする。
create type channel           as enum ('web','line');
create type msg_actor         as enum ('student','agent','teacher','system');

create type lesson_status     as enum ('draft','material_ready','analyzed','published','archived');
create type question_format   as enum ('mcq','short_answer','numeric','explain','transfer');
create type assignment_kind   as enum ('initial','review','reassessment');
create type assignment_status as enum ('draft','pending_approval','published','completed','cancelled');

create type conv_state        as enum ('active','summarizing','awaiting_assessment','completed','escalated','abandoned');

-- AI評価のレビュー状態。confidence < 0.6 は必ず pending_review に落ちる。
create type review_status     as enum ('auto_approved','pending_review','approved','overridden','rejected');
create type plan_status       as enum ('draft','pending_review','approved','active','superseded');

-- 設計書11章の自律ワークフロー状態。
create type workflow_state    as enum (
  'created','material_ready','assignment_drafted','teacher_review','published',
  'in_progress','evaluating','plan_updated','reassessment_scheduled','completed',
  'escalated','failed_retryable'
);

create type job_status        as enum ('queued','leased','succeeded','failed','dead','cancelled');

-- AI呼び出しの結末。degraded と blocked を error と区別することが観測性の肝。
create type agent_run_status  as enum (
  'ok',            -- 一発成功
  'schema_repaired', -- 構造化出力の修復1回で成功
  'failed_over',   -- フォールバック連鎖の下段で成功
  'degraded',      -- 全滅してルールベース応答へ縮退
  'rate_limited',  -- 無料枠切れ。モデル障害ではない
  'blocked',       -- Guardrails / Firewall / 自前Safety層が遮断
  'error'          -- 上記以外の失敗
);

create type escalation_kind   as enum (
  'low_confidence','safety','repeated_failure','budget','stalled','distress'
);
create type escalation_status as enum ('open','acknowledged','resolved','dismissed');

-- 承認が要るアクション（設計書11章）。approvals テーブルの単一入口で扱う。
create type approval_resource as enum (
  'lesson','assignment','assessment','plan','broadcast','intervention'
);
create type approval_decision as enum ('approved','modified','rejected');

create type intervention_priority as enum ('urgent','high','medium','low');

create type notification_kind as enum (
  'review_due','new_assignment','teacher_reply','plan_updated','announcement'
);
