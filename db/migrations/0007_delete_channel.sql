-- =====================================================================
-- Team Chat · owners and admins can delete a channel (except #general).
-- Messages, files links, reactions, drafts and memberships cascade.
-- =====================================================================
begin;
set local search_path to chat, public;

create or replace function chat.delete_channel(p_conv uuid) returns void
language plpgsql security definer set search_path = chat, public as $$
declare c conversations;
begin
  select * into c from conversations where id = p_conv;
  if c.id is null or not can_read_conv(p_conv) then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  perform require_role(c.workspace_id, '{owner,admin}');
  if c.kind not in ('public_channel', 'private_channel') then
    raise exception 'Only channels can be deleted' using errcode = '22023';
  end if;
  if c.name = 'general' then raise exception '#general can''t be deleted' using errcode = '22023'; end if;
  -- Files only attached to this channel's messages go too.
  delete from files f
   where exists (select 1 from message_files mf join messages m on m.id = mf.message_id
                  where mf.file_id = f.id and m.conversation_id = p_conv)
     and not exists (select 1 from message_files mf join messages m on m.id = mf.message_id
                      where mf.file_id = f.id and m.conversation_id <> p_conv);
  delete from conversations where id = p_conv;
end $$;

revoke execute on function chat.delete_channel(uuid) from public;
grant execute on function chat.delete_channel(uuid) to chat_user;

commit;
