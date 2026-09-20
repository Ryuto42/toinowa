-- 会話ワークのサーバーAPIがPostgREST経由で使う最小限の権限。
-- service_roleでも、SQLで作ったテーブルにはオブジェクト権限が別途必要。
-- アプリ側でテナント境界とロールを検証したAPIからのみ利用する。
grant usage on schema public to service_role;

grant select, insert, update on table
  public.conversations,
  public.messages,
  public.answers,
  public.assessments,
  public.approvals,
  public.agent_runs,
  public.agent_run_attempts,
  public.ai_budget_ledger
to service_role;

grant select, insert, update on table
  public.users,
  public.student_profiles,
  public.lessons,
  public.concepts,
  public.questions,
  public.assignments,
  public.tenants,
  public.model_disables
to service_role;

grant select, insert, update, delete on table public.jobs to service_role;
grant select, insert, update on table public.jobs_dead to service_role;
