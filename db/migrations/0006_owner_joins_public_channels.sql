-- =====================================================================
-- Team Chat · the first owner of a fresh workspace joins every public
-- channel (other invitees still only join #general, like Slack).
-- =====================================================================
begin;
set local search_path to chat, public;

create or replace function chat.claim_pending_invitations(p_user uuid) returns integer
language plpgsql security definer set search_path = chat, public as $$
declare inv invitations; me users; n integer := 0; r member_role;
begin
  select * into me from users where id = p_user;
  if me.id is null or me.email is null or me.is_bot then return 0; end if;
  for inv in select * from invitations
              where email = me.email and status = 'pending' and expires_at > now() for update loop
    -- The first person to join an ownerless workspace (fresh install) becomes its owner.
    r := case when exists (select 1 from workspace_members where workspace_id = inv.workspace_id and role = 'owner')
              then inv.role else 'owner'::member_role end;
    insert into workspace_members (workspace_id, user_id, role) values (inv.workspace_id, me.id, r)
      on conflict (workspace_id, user_id) do update set deactivated_at = null;
    insert into user_preferences (user_id, workspace_id) values (me.id, inv.workspace_id) on conflict do nothing;
    insert into conversation_members (conversation_id, user_id)
      select id, me.id from conversations
       where workspace_id = inv.workspace_id and kind = 'public_channel' and archived_at is null
         and (name = 'general' or r = 'owner')
      on conflict do nothing;
    update invitations set status = 'accepted' where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function chat.claim_pending_invitations(uuid) from public, chat_user;

-- Owners who already signed in before this migration.
insert into conversation_members (conversation_id, user_id)
select c.id, wm.user_id
  from workspace_members wm
  join conversations c on c.workspace_id = wm.workspace_id and c.kind = 'public_channel' and c.archived_at is null
 where wm.role = 'owner' and wm.deactivated_at is null
on conflict do nothing;

commit;
