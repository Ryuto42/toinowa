-- 自己紹介の練習は、学力評価や宿題から独立した対話として記録する。
alter table public.conversations add column purpose text not null default 'learning' check(purpose in ('learning','tutorial'));
alter table public.conversations add constraint tutorial_without_subject check(purpose<>'tutorial' or (lesson_id is null and concept_id is null));
create unique index one_student_tutorial on public.conversations(tenant_id,student_id) where purpose='tutorial';

create function public.start_student_tutorial(p_tenant uuid,p_student uuid,p_opening text) returns uuid language plpgsql security definer set search_path='' as $$
declare conversation uuid;
begin
 perform 1 from public.users where id=p_student and tenant_id=p_tenant and role='student' and status='active' and not must_change_password for share;
 if not found then raise exception '生徒としてログインしてください'; end if;
 if length(trim(p_opening)) not between 1 and 2000 then raise exception '案内文が不正です'; end if;
 insert into public.conversations(tenant_id,student_id,channel,purpose,message_count)
 values(p_tenant,p_student,'web','tutorial',1)
 on conflict(tenant_id,student_id) where purpose='tutorial' do nothing returning id into conversation;
 if conversation is null then
  select id into conversation from public.conversations where tenant_id=p_tenant and student_id=p_student and purpose='tutorial';
 else
  insert into public.messages(tenant_id,conversation_id,seq,actor,content_redacted,channel)
  values(p_tenant,conversation,1,'agent',p_opening,'web');
 end if;
 return conversation;
end $$;
revoke all on function public.start_student_tutorial(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.start_student_tutorial(uuid,uuid,text) to service_role;

create function private.prevent_tutorial_assessment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.conversations where id=new.conversation_id and purpose='tutorial') then raise exception '練習の対話は採点対象にできません'; end if;
 return new;
end $$;
create trigger no_tutorial_answers before insert or update of conversation_id on public.answers for each row execute function private.prevent_tutorial_assessment();
create trigger no_tutorial_assessments before insert or update of conversation_id on public.assessments for each row execute function private.prevent_tutorial_assessment();
revoke all on function private.prevent_tutorial_assessment() from public,anon,authenticated,service_role;
