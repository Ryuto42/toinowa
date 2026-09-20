-- PostgREST経由のアプリ利用に必要なテーブル権限。
-- 行単位の可否は0010_rls.sqlのRLSポリシーが引き続き決める。
-- SQLで作成したテーブルは、Supabaseの自動grant対象にならない環境があるため明示する。

grant usage on schema public to anon, authenticated;
grant select on table public.school_codes to anon, authenticated;

grant select on table
  public.tenants,
  public.users,
  public.student_profiles,
  public.classrooms,
  public.enrollments,
  public.lessons,
  public.materials,
  public.concepts,
  public.material_chunks,
  public.questions,
  public.assignments,
  public.answers,
  public.conversations,
  public.messages,
  public.teacher_questions,
  public.assessments,
  public.learning_plans,
  public.review_schedules,
  public.escalations,
  public.approvals,
  public.notifications,
  public.push_subscriptions,
  public.announcements
to authenticated;

grant update on table public.student_profiles to authenticated;
grant insert on table public.answers to authenticated;
grant insert, update on table public.teacher_questions to authenticated;
grant update on table public.notifications to authenticated;
grant insert, update, delete on table public.push_subscriptions to authenticated;
