-- 直前の「生徒の送信 → AIの返信」だけを取り消せるようにする。
--
-- messages / answers には DELETE 権限を誰にも与えていない（学習記録は追記のみ）。
-- 取り消しのためだけに DELETE を service_role へ開くと、
-- アプリのどこからでも過去の会話を消せるようになってしまう。
--
-- そこで「最後の1往復に限る」条件を関数の中に閉じ込め、
-- 呼び出し側が範囲を指定できないようにする。
--   ・対象は最後の生徒メッセージ以降だけ
--   ・会話が完了していたら何もしない（評価の根拠が動くため）
--   ・その送信で作られた回答も一緒に消す

create or replace function public.undo_last_exchange(
  p_tenant uuid, p_student uuid, p_conversation uuid
) returns table (restored_text text, removed_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_seq     integer;
  v_text    text;
  v_removed integer;
begin
  perform 1 from public.conversations
    where id = p_conversation and tenant_id = p_tenant
      and student_id = p_student and state <> 'completed'
    for update;
  if not found then raise exception 'conversation is not undoable'; end if;

  select m.seq, m.content_redacted into v_seq, v_text
    from public.messages m
    where m.tenant_id = p_tenant and m.conversation_id = p_conversation and m.actor = 'student'
    order by m.seq desc limit 1;
  if v_seq is null then raise exception 'nothing to undo'; end if;

  delete from public.messages m
    where m.tenant_id = p_tenant and m.conversation_id = p_conversation and m.seq >= v_seq;
  get diagnostics v_removed = row_count;

  delete from public.answers a
    where a.id = (
      select a2.id from public.answers a2
      where a2.tenant_id = p_tenant and a2.conversation_id = p_conversation and a2.student_id = p_student
      order by a2.answered_at desc limit 1
    );

  update public.conversations set message_count = v_seq - 1
    where id = p_conversation and tenant_id = p_tenant;

  restored_text := v_text;
  removed_count := v_removed;
  return next;
end $$;

revoke all on function public.undo_last_exchange(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_last_exchange(uuid, uuid, uuid) to service_role;
