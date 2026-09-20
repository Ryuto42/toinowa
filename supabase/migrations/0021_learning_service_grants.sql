-- SQLで作成したテーブルはservice_roleでも明示的なオブジェクト権限が必要。
grant select on public.classrooms to service_role;
grant select, insert, update on public.enrollments, public.learning_plans to service_role;
grant select, insert, update on public.escalations, public.notifications, public.guard_events to service_role;
grant insert, select on public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq, public.guard_events_id_seq, public.agent_run_attempts_id_seq to service_role;
