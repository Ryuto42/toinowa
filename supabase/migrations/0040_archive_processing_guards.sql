-- 複数テーブルで共用するトリガーは、存在しない列を式の評価前に分岐する。
create or replace function private.guard_learning_write() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); v_class uuid; v_student uuid; v_lesson uuid;
begin
 v_class:=(j->>'classroom_id')::uuid; v_student:=(j->>'student_id')::uuid; v_lesson:=(j->>'lesson_id')::uuid;
 if tg_table_name='enrollments' then
  if new.role='student' and new.active then
   if exists(select 1 from public.classrooms where id=new.classroom_id and individual_student_id is not null and individual_student_id<>new.user_id) then raise exception '個別指導には他の生徒を登録できません'; end if;
  end if;
  return new;
 end if;
 if j->>'conversation_id' is not null then select lesson_id,student_id into v_lesson,v_student from public.conversations where id=(j->>'conversation_id')::uuid; end if;
 if v_lesson is null and j->>'concept_id' is not null then select lesson_id into v_lesson from public.concepts where id=(j->>'concept_id')::uuid; end if;
 if v_lesson is not null then select classroom_id into v_class from public.lessons where id=v_lesson; end if;
 perform private.assert_learning_active((j->>'tenant_id')::uuid,v_class,v_student);
 if tg_table_name='assignments' then
  if new.student_id is null then select individual_student_id into new.student_id from public.classrooms where id=new.classroom_id; end if;
 end if;
 return new;
end $$;

create or replace function public.manage_resource(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid,p_action text,p_confirmation text default '',p_fingerprint text default '') returns void language plpgsql security definer set search_path='' as $$
declare preview jsonb; s jsonb; ids uuid[]; convs uuid[]; plan_ids uuid[]; lesson_ids uuid[]; concept_ids uuid[]; class_ids uuid[];
begin
 perform private.require_admin(p_tenant,p_actor);
 if p_kind='student' then perform 1 from public.users where id=p_id and tenant_id=p_tenant and role='student' for update;
 elsif p_kind='classroom' then perform 1 from public.classrooms where id=p_id and tenant_id=p_tenant and individual_student_id is null for update;
 else raise exception '対象が不正です'; end if;
 if not found then raise exception '対象が見つかりません'; end if;
 preview:=public.managed_resource_preview(p_tenant,p_actor,p_kind,p_id);
 s:=private.management_scope(p_tenant,p_kind,p_id); ids:=private.scope_ids(s,'all');
 if p_action='archive' then
  if p_kind='student' then
   update public.users set archived_previous_status=status,archived_at=now(),status='suspended',password_revision=password_revision+1 where id=p_id and archived_at is null;
   delete from auth.refresh_tokens where user_id=p_id::text;
   delete from auth.sessions where user_id=p_id;
  else update public.classrooms set archived_at=coalesce(archived_at,now()) where id=p_id; end if;
  -- 未着手の処理は停止する。実行中の呼び出しは停止できないが、保存時のガードで反映を防ぐ。
  update public.jobs set status='succeeded',last_error='archived',state=state||'{"cancelledByArchive":true}'::jsonb,locked_until=null,lease_token=null where tenant_id=p_tenant and (status='queued' or (status='leased' and locked_until<=now())) and private.references_scope(payload||state,ids);
 elsif p_action='restore' then
  if p_kind='student' then update public.users set archived_at=null,status=coalesce(archived_previous_status,'active'),archived_previous_status=null where id=p_id and archived_at is not null;
  else update public.classrooms set archived_at=null where id=p_id; end if;
 elsif p_action='delete' then
  if preview->>'archivedAt' is null then raise exception '先にアーカイブしてください'; end if;
  if p_confirmation is distinct from preview->>'name' then raise exception '確認のため対象の名前を入力してください'; end if;
  if p_fingerprint is distinct from preview->>'fingerprint' then raise exception '関連データが変わりました。影響を再確認してください'; end if;
  if (preview->>'runningJobs')::int>0 then raise exception '処理中のAI作業があります。完了後に再確認してください'; end if;
  convs:=private.scope_ids(s,'conversations'); plan_ids:=private.scope_ids(s,'plans'); lesson_ids:=private.scope_ids(s,'lessons'); concept_ids:=private.scope_ids(s,'concepts'); class_ids:=private.scope_ids(s,'classes');
  delete from public.jobs where tenant_id=p_tenant and private.references_scope(payload||state,ids);
  delete from public.jobs_dead where tenant_id=p_tenant and private.references_scope(payload||state,ids);
  delete from public.workflow_runs where tenant_id=p_tenant and (subject_id=any(ids) or private.references_scope(context,ids));
  delete from public.guard_events where tenant_id=p_tenant and (conversation_id=any(convs) or agent_run_id=any(private.scope_ids(s,'runs')) or (p_kind='student' and student_id=p_id));
  delete from public.agent_runs where tenant_id=p_tenant and id=any(private.scope_ids(s,'runs'));
  delete from public.teacher_questions where tenant_id=p_tenant and (conversation_id=any(convs) or concept_id=any(concept_ids) or (p_kind='student' and student_id=p_id));
  delete from public.notifications where tenant_id=p_tenant and (private.references_scope(payload,ids) or (p_kind='student' and student_id=p_id));
  delete from public.approvals where tenant_id=p_tenant and resource_id=any(ids);
  delete from public.conversations where tenant_id=p_tenant and id=any(convs);
  update public.learning_plans set supersedes_plan_id=null where tenant_id=p_tenant and supersedes_plan_id=any(plan_ids);
  delete from public.learning_plans where tenant_id=p_tenant and id=any(plan_ids);
  delete from public.assessments where tenant_id=p_tenant and id=any(private.scope_ids(s,'assessments'));
  delete from public.assignments where tenant_id=p_tenant and id=any(private.scope_ids(s,'assignments'));
  delete from public.lessons where tenant_id=p_tenant and id=any(lesson_ids);
  delete from public.ai_budget_ledger where tenant_id=p_tenant and ((scope='classroom' and scope_id=any(class_ids)) or (p_kind='student' and scope='student' and scope_id=p_id));
  -- 集合授業の記録・他の生徒のデータは残し、削除生徒の参照だけを外す。
  if p_kind='student' then
   update public.lesson_preparations set student_ids=array_remove(student_ids,p_id) where tenant_id=p_tenant and p_id=any(student_ids);
   delete from auth.users where id=p_id;
  else delete from public.classrooms where id=p_id and tenant_id=p_tenant; end if;
 else raise exception '操作が不正です'; end if;
 insert into public.audit_logs(tenant_id,actor_id,actor_role,action,resource_type,resource_id,result,detail)
 values(p_tenant,p_actor,'admin',p_kind||'.'||p_action,p_kind,p_id,'allow',jsonb_build_object('counts',preview->'counts'));
end $$;
-- ジョブ開始直前と予約時に対象の状態を調べ、アーカイブ後の不要なAI呼び出しを防ぐ。
create function public.learning_work_active(p_tenant uuid,p_payload jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare student uuid:=(p_payload->>'studentId')::uuid; classroom uuid:=(p_payload->>'classroomId')::uuid; lesson uuid:=(p_payload->>'lessonId')::uuid; r record;
begin
 if p_payload->>'conversationId' is not null then
  select student_id,lesson_id into r from public.conversations where tenant_id=p_tenant and id=(p_payload->>'conversationId')::uuid;
  if not found then return false; end if; student:=r.student_id; lesson:=r.lesson_id;
 end if;
 if p_payload->>'analysisId' is not null then
  select student_id into r from public.exam_analyses where tenant_id=p_tenant and id=(p_payload->>'analysisId')::uuid;
  if not found then return false; end if; student:=r.student_id;
 end if;
 if p_payload->>'preparationId' is not null then
  select classroom_id into r from public.lesson_preparations where tenant_id=p_tenant and id=(p_payload->>'preparationId')::uuid;
  if not found then return false; end if; classroom:=r.classroom_id;
 end if;
 if lesson is not null then
  select classroom_id into r from public.lessons where tenant_id=p_tenant and id=lesson;
  if not found then return false; end if; classroom:=r.classroom_id;
 end if;
 perform private.assert_learning_active(p_tenant,classroom,student);
 return true;
exception when raise_exception then return false;
end $$;
revoke all on function public.learning_work_active(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.learning_work_active(uuid,jsonb) to service_role;
create function private.guard_active_job() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.learning_work_active(new.tenant_id,new.payload) then raise exception '対象の生徒・クラスの学習は停止されています'; end if;
 return new;
end $$;
create trigger guard_active_job before insert on public.jobs for each row execute function private.guard_active_job();
revoke all on function private.guard_active_job() from public,anon,authenticated,service_role;
