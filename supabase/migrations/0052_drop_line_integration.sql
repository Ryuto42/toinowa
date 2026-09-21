-- LINE連携は設計しないことにしたので、置きっぱなしだったスキーマを落とす。
--
-- 使われていないテーブルを残すと、実装済みの機能だと誤解される。
-- 実装しないと決めたものは、環境変数・画面・コードと同じくスキーマからも消す。
--
-- `channel` 列挙型の 'line' は残す。列挙値の削除は型の再作成が必要で、
-- conversations.channel / messages.channel の既定値と依存を張り替えることになる。
-- 値がひとつ余分にあることの害より、その入れ替えの危険のほうが大きい。

-- 保持期間ジョブから、消すテーブルへの参照を外す。
-- 同じ名前で schedule すると既存の定義を置き換える。
select cron.schedule(
  'enforce-retention',
  '10 18 * * *',
  $$
  delete from public.messages m
  using public.tenants t
  where m.tenant_id = t.id
    and m.created_at < now() - make_interval(days => t.retention_days);

  delete from public.agent_runs a
  using public.tenants t
  where a.tenant_id = t.id
    and a.created_at < now() - make_interval(days => t.retention_days);

  delete from public.audit_logs l
  using public.tenants t
  where l.tenant_id = t.id
    and l.created_at < now() - make_interval(days => greatest(t.retention_days, 365));
  $$
);

drop table if exists public.channel_link_tokens;
drop table if exists public.line_account_links;

alter table public.tenants drop column if exists line_channel_config_id;
