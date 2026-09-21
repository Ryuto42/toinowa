-- 担当外の先生が他クラスの課題・お題を読めてしまう穴を塞ぐ。
--
-- assignments_teacher_write / questions_teacher_write は `for all` で作られており、
-- ポリシーは OR で合成されるため、`for all` の USING がそのまま SELECT にも効く。
-- その USING は「このテナントの先生なら誰でも」だったので、
-- せっかく assignments_read でクラス範囲を絞っていても素通りしていた。
--
-- 実際に、B組だけを担当する先生からA組の課題が見えることを確認している
-- （tests/security/rls.test.ts）。
--
-- 書き込み自体は create_explanation_work / topics API（どちらも担当クラスを
-- 確認している）を通るので、ポリシー側は自分の担当範囲に限定してよい。

drop policy if exists assignments_teacher_write on public.assignments;
create policy assignments_teacher_write on public.assignments for all to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      private.current_role() = 'admin'
      or (private.current_role() = 'teacher'
          and (classroom_id in (select private.my_classrooms())
               or private.teaches_student(student_id)))
    )
  )
  with check (
    tenant_id = private.current_tenant()
    and (
      private.current_role() = 'admin'
      or (private.current_role() = 'teacher'
          and (classroom_id in (select private.my_classrooms())
               or private.teaches_student(student_id)))
    )
  );

drop policy if exists questions_teacher_write on public.questions;
create policy questions_teacher_write on public.questions for all to authenticated
  using (
    tenant_id = private.current_tenant()
    and (
      private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and concept_id in (
        select c.id from public.concepts c
        join public.lessons l on l.id = c.lesson_id
        where l.classroom_id in (select private.my_classrooms())
      ))
    )
  )
  with check (
    tenant_id = private.current_tenant()
    and (
      private.current_role() = 'admin'
      or (private.current_role() = 'teacher' and concept_id in (
        select c.id from public.concepts c
        join public.lessons l on l.id = c.lesson_id
        where l.classroom_id in (select private.my_classrooms())
      ))
    )
  );
