-- 取り消した直後に残る最後の生徒メッセージを記録する。
-- 再読み込み・別タブでもそれ以前を取り消せず、新しい送信（別UUID）なら再度取り消せる。
-- メッセージの連番は取り消し後に再利用されるため、判定にはUUIDを使う。
alter table public.conversations add column if not exists undo_blocked_message_id uuid;

create or replace function public.undo_last_exchange(
  p_tenant uuid, p_student uuid, p_conversation uuid
) returns table (restored_text text, removed_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_seq     integer;
  v_message uuid;
  v_blocked uuid;
  v_text    text;
  v_removed integer;
begin
  select undo_blocked_message_id into v_blocked from public.conversations
    where id = p_conversation and tenant_id = p_tenant
      and student_id = p_student and state <> 'completed'
    for update;
  if not found then raise exception 'conversation is not undoable'; end if;

  select m.id, m.seq, m.content_redacted into v_message, v_seq, v_text
    from public.messages m
    where m.tenant_id = p_tenant and m.conversation_id = p_conversation and m.actor = 'student'
    order by m.seq desc limit 1;
  if v_seq is null or v_message = v_blocked then
    raise exception '取り消せる送信がありません';
  end if;

  delete from public.messages m
    where m.tenant_id = p_tenant and m.conversation_id = p_conversation and m.seq >= v_seq;
  get diagnostics v_removed = row_count;

  delete from public.answers a
    where a.id = (
      select a2.id from public.answers a2
      where a2.tenant_id = p_tenant and a2.conversation_id = p_conversation and a2.student_id = p_student
      order by a2.answered_at desc limit 1
    );

  update public.conversations set message_count = v_seq - 1,
    undo_blocked_message_id = (
      select m.id from public.messages m
      where m.tenant_id = p_tenant and m.conversation_id = p_conversation and m.actor = 'student'
      order by m.seq desc limit 1
    )
    where id = p_conversation and tenant_id = p_tenant;

  restored_text := v_text;
  removed_count := v_removed;
  return next;
end $$;

revoke all on function public.undo_last_exchange(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_last_exchange(uuid, uuid, uuid) to service_role;
