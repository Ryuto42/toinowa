alter table public.student_profiles add column learning_goal text not null default '';
alter table public.student_profiles add column exam_results text not null default '';
alter table public.student_profiles add column weak_areas text not null default '';

-- 計画表は先生・管理者用。生徒には次のお題だけを公開する。
drop policy learning_plans_read on public.learning_plans;
create policy learning_plans_read on public.learning_plans for select to authenticated using (
  tenant_id = private.current_tenant() and (
    private.current_role() = 'admin'
    or (private.current_role() = 'teacher' and private.teaches_student(student_id))
  )
);
