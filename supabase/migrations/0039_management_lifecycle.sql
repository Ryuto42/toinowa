-- 削除対象の集合を一箇所で定義し、影響確認と実行で共用する。
create function private.management_scope(p_tenant uuid,p_kind text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare classes uuid[]; lessons uuid[]; concepts uuid[]; conversations uuid[]; plans uuid[]; assignments uuid[]; assessments uuid[]; preparations uuid[]; exams uuid[]; runs uuid[]; all_ids uuid[];
begin
 select coalesce(array_agg(id order by id),'{}') into classes from public.classrooms where tenant_id=p_tenant and ((p_kind='classroom' and id=p_id) or (p_kind='student' and individual_student_id=p_id));
 select coalesce(array_agg(l.id order by l.id),'{}') into lessons from public.lessons l where l.tenant_id=p_tenant and
 (l.classroom_id=any(classes) or (p_kind='student' and exists(select 1 from public.assignments a where a.lesson_id=l.id and a.student_id=p_id) and not exists(select 1 from public.assignments a where a.lesson_id=l.id and (a.student_id is null or a.student_id<>p_id)) and not exists(select 1 from public.conversations c where c.lesson_id=l.id and c.student_id<>p_id)));
 select coalesce(array_agg(id order by id),'{}') into concepts from public.concepts where tenant_id=p_tenant and lesson_id=any(lessons);
 select coalesce(array_agg(id order by id),'{}') into conversations from public.conversations where tenant_id=p_tenant and (lesson_id=any(lessons) or (p_kind='student' and student_id=p_id));
 select coalesce(array_agg(id order by id),'{}') into plans from public.learning_plans where tenant_id=p_tenant and (classroom_id=any(classes) or (p_kind='student' and student_id=p_id));
 select coalesce(array_agg(id order by id),'{}') into assignments from public.assignments where tenant_id=p_tenant and (classroom_id=any(classes) or lesson_id=any(lessons) or (p_kind='student' and student_id=p_id));
 select coalesce(array_agg(id order by id),'{}') into assessments from public.assessments where tenant_id=p_tenant and (concept_id=any(concepts) or conversation_id=any(conversations) or (p_kind='student' and student_id=p_id));
 select coalesce(array_agg(id order by id),'{}') into preparations from public.lesson_preparations where tenant_id=p_tenant and classroom_id=any(classes);
 select coalesce(array_agg(id order by id),'{}') into exams from public.exam_analyses where tenant_id=p_tenant and p_kind='student' and student_id=p_id;
 select coalesce(array_agg(id order by id),'{}') into runs from public.agent_runs where tenant_id=p_tenant and (conversation_id=any(conversations) or (p_kind='student' and student_id=p_id));
 all_ids:=array[p_id]||classes||lessons||concepts||conversations||plans||assignments||assessments||preparations||exams||runs;
 return jsonb_build_object('classes',classes,'lessons',lessons,'concepts',concepts,'conversations',conversations,'plans',plans,'assignments',assignments,'assessments',assessments,'preparations',preparations,'exams',exams,'runs',runs,'all',all_ids);
end $$;
create function private.scope_ids(s jsonb,k text) returns uuid[] language sql immutable set search_path='' as $$ select coalesce(array_agg(value::uuid),'{}') from jsonb_array_elements_text(s->k) $$;
create function private.references_scope(value jsonb,ids uuid[]) returns boolean language sql immutable set search_path='' as $$ select exists(select 1 from unnest(ids) id where position(id::text in value::text)>0) $$;

create function public.managed_resource_preview(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; counts jsonb; v_name text; v_archived timestamptz; v_ids uuid[];
begin
 perform private.require_admin(p_tenant,p_actor);
 if p_kind='student' then select display_name,archived_at into v_name,v_archived from public.users where tenant_id=p_tenant and id=p_id and role='student' for share;
 elsif p_kind='classroom' then select name,archived_at into v_name,v_archived from public.classrooms where tenant_id=p_tenant and id=p_id and individual_student_id is null for share;
 else raise exception '対象が不正です'; end if;
 if v_name is null then raise exception '対象が見つかりません'; end if;
 s:=private.management_scope(p_tenant,p_kind,p_id); v_ids:=private.scope_ids(s,'all');
 counts:=jsonb_build_object('lessons',jsonb_array_length(s->'lessons'),'assignments',jsonb_array_length(s->'assignments'),'conversations',jsonb_array_length(s->'conversations'),'assessments',jsonb_array_length(s->'assessments'),'plans',jsonb_array_length(s->'plans'),'preparations',jsonb_array_length(s->'preparations'),'exams',jsonb_array_length(s->'exams'),
 'messages',(select count(*) from public.messages where tenant_id=p_tenant and conversation_id=any(private.scope_ids(s,'conversations'))),
 'members',(select count(*) from public.enrollments where tenant_id=p_tenant and classroom_id=any(private.scope_ids(s,'classes')) and role='student' and active),
 'jobs',(select count(*) from public.jobs where tenant_id=p_tenant and private.references_scope(payload||state,v_ids))+(select count(*) from public.jobs_dead where tenant_id=p_tenant and private.references_scope(payload||state,v_ids)));
 return jsonb_build_object('name',v_name,'archivedAt',v_archived,'counts',counts,'fingerprint',md5(s::text||counts::text||v_name||coalesce(v_archived::text,'')),
 'runningJobs',(select count(*) from public.jobs where tenant_id=p_tenant and status='leased' and locked_until>now() and private.references_scope(payload||state,v_ids)));
end $$;

create function public.manage_resource(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid,p_action text,p_confirmation text default '',p_fingerprint text default '') returns void language plpgsql security definer set search_path='' as $$
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
  if p_kind='student' then update public.users set archived_at=null,status=coalesce(archived_previous_status,'active'),archived_previous_status=null where id=p_id;
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
revoke all on function public.managed_resource_preview(uuid,uuid,text,uuid),public.manage_resource(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.managed_resource_preview(uuid,uuid,text,uuid),public.manage_resource(uuid,uuid,text,uuid,text,text,text) to service_role;
revoke all on function private.management_scope(uuid,text,uuid),private.scope_ids(jsonb,text),private.references_scope(jsonb,uuid[]) from public,anon,authenticated,service_role;
