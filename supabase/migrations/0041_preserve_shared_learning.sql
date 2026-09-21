-- 別の生徒が利用した問題・評価は、生徒単体の削除に巻き込まない。
-- 削除対象の集合を一箇所で定義し、影響確認と実行で共用する。
create or replace function private.management_scope(p_tenant uuid,p_kind text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare classes uuid[]; lessons uuid[]; concepts uuid[]; conversations uuid[]; plans uuid[]; assignments uuid[]; assessments uuid[]; preparations uuid[]; exams uuid[]; runs uuid[]; all_ids uuid[];
begin
 select coalesce(array_agg(id order by id),'{}') into classes from public.classrooms where tenant_id=p_tenant and ((p_kind='classroom' and id=p_id) or (p_kind='student' and individual_student_id=p_id));
 select coalesce(array_agg(l.id order by l.id),'{}') into lessons from public.lessons l where l.tenant_id=p_tenant and
 (l.classroom_id=any(classes) or (p_kind='student' and exists(select 1 from public.assignments a where a.lesson_id=l.id and a.student_id=p_id) and not exists(select 1 from public.assignments a where a.lesson_id=l.id and (a.student_id is null or a.student_id<>p_id)) and not exists(select 1 from public.conversations c where c.lesson_id=l.id and c.student_id<>p_id)
 and not exists(select 1 from public.assessments a join public.concepts c on c.id=a.concept_id where c.lesson_id=l.id and a.student_id<>p_id)
 and not exists(select 1 from public.answers a join public.questions q on q.id=a.question_id join public.concepts c on c.id=q.concept_id where c.lesson_id=l.id and a.student_id<>p_id)
 and not exists(select 1 from public.review_schedules r join public.concepts c on c.id=r.concept_id where c.lesson_id=l.id and r.student_id<>p_id)
 and not exists(select 1 from public.teacher_questions q join public.concepts c on c.id=q.concept_id where c.lesson_id=l.id and q.student_id<>p_id)));
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
