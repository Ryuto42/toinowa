-- クラス一斉配信（student_id が null）の課題を在籍生徒へ公開する。
-- 既存の個別配信・教師範囲の条件は維持し、テナント境界も必ず残す。
drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      student_id = auth.uid()
      or (
        private.current_role() = 'student'
        and classroom_id in (select private.my_classrooms())
        and status in ('published', 'completed')
      )
      or private.current_role() = 'admin'
      or (private.current_role() = 'teacher'
          and (classroom_id in (select private.my_classrooms())
               or private.teaches_student(student_id)))
    )
  );
