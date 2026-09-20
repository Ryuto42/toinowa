-- 詳細評価は先生・管理者専用。生徒には認証済みAPIが簡易版だけを投影する。
alter table public.assessments add column conversation_id uuid references public.conversations(id) on delete set null;
alter table public.assessments add column is_final boolean not null default false;
create unique index assessments_final_conversation_idx on public.assessments(conversation_id)
  where is_final and conversation_id is not null;

drop policy assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated using (
  tenant_id = private.current_tenant() and (
    private.current_role() = 'admin'
    or (private.current_role() = 'teacher' and private.teaches_student(student_id))
  )
);

alter table public.agent_runs add column actor_id uuid references public.users(id) on delete set null;
create index agent_runs_actor_time_idx on public.agent_runs(tenant_id, actor_id, created_at desc);
