-- =====================================================================
-- Team Chat · invitation-only auth gate
-- 1. is_email_allowed(): /api/auth/otp only sends a code to emails with a
--    pending invitation or an active membership.
-- 2. Auto-claims pending invitations when an invited person signs in.
-- =====================================================================
begin;
set local search_path to chat, public;

create or replace function chat.is_email_allowed(p_email citext) returns boolean
language sql stable security definer set search_path = chat, public as $$
  select exists (
           select 1 from invitations
            where email = p_email and status = 'pending' and expires_at > now())
      or exists (
           select 1 from users u
             join workspace_members wm on wm.user_id = u.id and wm.deactivated_at is null
            where u.email = p_email and not u.is_bot)
$$;

revoke execute on function chat.is_email_allowed(citext) from public, chat_user;

-- Invited people sign in with an email code (no token in hand):
-- every pending invitation for their email is accepted on first sign-in.
create or replace function chat.claim_invitations() returns trigger
language plpgsql security definer set search_path = chat, public as $$
declare inv invitations;
begin
  if new.email is null or new.is_bot then return new; end if;
  for inv in select * from invitations
              where email = new.email and status = 'pending' and expires_at > now() for update loop
    -- The first person to join an ownerless workspace (fresh install) becomes its owner.
    insert into workspace_members (workspace_id, user_id, role)
      values (inv.workspace_id, new.id,
              case when exists (select 1 from workspace_members
                                 where workspace_id = inv.workspace_id and role = 'owner')
                   then inv.role else 'owner'::member_role end)
      on conflict (workspace_id, user_id) do update set deactivated_at = null;
    insert into user_preferences (user_id, workspace_id) values (new.id, inv.workspace_id) on conflict do nothing;
    insert into conversation_members (conversation_id, user_id)
      select id, new.id from conversations
       where workspace_id = inv.workspace_id and kind = 'public_channel' and name = 'general'
      on conflict do nothing;
    update invitations set status = 'accepted' where id = inv.id;
  end loop;
  return new;
end $$;

drop trigger if exists users_claim_invitations on users;
create trigger users_claim_invitations
  after insert on users for each row execute function chat.claim_invitations();

commit;
