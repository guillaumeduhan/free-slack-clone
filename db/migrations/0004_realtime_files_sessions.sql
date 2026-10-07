-- =====================================================================
-- Team Chat · replaces Supabase Realtime, Storage and Auth glue
-- - pg_notify('chat', …) on every change the UI listens to
-- - file contents stored in Postgres (bytea)
-- - sessions linked to users, invitation claiming reusable on sign-in
-- =====================================================================
begin;
set local search_path to chat, public;

-- ---------------------------------------------------------------------
-- Sign-in codes and sessions. Server only: chat_user gets no access.
-- ---------------------------------------------------------------------
-- One pending 6-digit code per email. Only the hash is stored.
create table if not exists sign_in_codes (
  email        citext primary key,
  code_hash    text not null,
  attempts     integer not null default 0,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

-- Opaque session tokens (cookie "tc_session" or Authorization: Bearer tcs_…).
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  token_hash   text not null unique,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days'
);
create index if not exists sessions_user on sessions (user_id);

revoke all on sign_in_codes, sessions from chat_user;
alter table sign_in_codes enable row level security;
alter table sessions enable row level security;

-- ---------------------------------------------------------------------
-- File contents (uploaded with PUT /api/files/:id/content)
-- ---------------------------------------------------------------------
create table if not exists file_blobs (
  file_id      uuid primary key references files (id) on delete cascade,
  data         bytea not null,
  uploaded_at  timestamptz not null default now()
);
alter table file_blobs enable row level security;
grant select, insert on file_blobs to chat_user;

drop policy if exists blobs_select on file_blobs;
create policy blobs_select on file_blobs for select using (
  exists (select 1 from files f where f.id = file_id and is_ws_member(f.workspace_id)));
drop policy if exists blobs_insert on file_blobs;
create policy blobs_insert on file_blobs for insert with check (
  exists (select 1 from files f where f.id = file_id and f.uploader_id = chat.uid()));

-- ---------------------------------------------------------------------
-- Sign-in: accept every pending invitation for this user's email.
-- Same logic as the users_claim_invitations trigger, callable for
-- people who already have a users row (e.g. re-invited after removal).
-- ---------------------------------------------------------------------
create or replace function chat.claim_pending_invitations(p_user uuid) returns integer
language plpgsql security definer set search_path = chat, public as $$
declare inv invitations; me users; n integer := 0;
begin
  select * into me from users where id = p_user;
  if me.id is null or me.email is null or me.is_bot then return 0; end if;
  for inv in select * from invitations
              where email = me.email and status = 'pending' and expires_at > now() for update loop
    -- The first person to join an ownerless workspace (fresh install) becomes its owner.
    insert into workspace_members (workspace_id, user_id, role)
      values (inv.workspace_id, me.id,
              case when exists (select 1 from workspace_members
                                 where workspace_id = inv.workspace_id and role = 'owner')
                   then inv.role else 'owner'::member_role end)
      on conflict (workspace_id, user_id) do update set deactivated_at = null;
    insert into user_preferences (user_id, workspace_id) values (me.id, inv.workspace_id) on conflict do nothing;
    insert into conversation_members (conversation_id, user_id)
      select id, me.id from conversations
       where workspace_id = inv.workspace_id and kind = 'public_channel' and name = 'general'
      on conflict do nothing;
    update invitations set status = 'accepted' where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function chat.claim_invitations() returns trigger
language plpgsql security definer set search_path = chat, public as $$
begin
  perform claim_pending_invitations(new.id);
  return new;
end $$;

revoke execute on function chat.claim_pending_invitations(uuid) from public, chat_user;

-- ---------------------------------------------------------------------
-- Realtime: one NOTIFY channel, the SSE endpoint fans out per workspace.
-- Payload: { table, op, workspace_id, conversation_id, message_id, parent_id, user_id }
-- ---------------------------------------------------------------------
create or replace function chat.notify_change() returns trigger
language plpgsql security definer set search_path = chat, public as $$
declare r record; conv uuid; ws uuid; msg bigint; parent bigint; who uuid;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_table_name = 'messages' then
    conv := r.conversation_id; msg := r.id; parent := r.parent_id; who := r.user_id;
  elsif tg_table_name = 'reactions' then
    msg := r.message_id; who := r.user_id;
    select m.conversation_id, m.parent_id into conv, parent from messages m where m.id = r.message_id;
  elsif tg_table_name = 'conversation_members' then
    conv := r.conversation_id; who := r.user_id;
  elsif tg_table_name = 'conversations' then
    conv := r.id; ws := r.workspace_id;
  end if;
  if ws is null and conv is not null then
    select workspace_id into ws from conversations where id = conv;
  end if;
  if ws is not null then
    perform pg_notify('chat', json_build_object(
      'table', tg_table_name, 'op', lower(tg_op), 'workspace_id', ws, 'conversation_id', conv,
      'message_id', msg, 'parent_id', parent, 'user_id', who)::text);
  end if;
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['messages', 'reactions', 'conversation_members', 'conversations'] loop
    execute format('drop trigger if exists %I on chat.%I', t || '_notify', t);
    execute format('create trigger %I after insert or update or delete on chat.%I
                    for each row execute function chat.notify_change()', t || '_notify', t);
  end loop;
end $$;

revoke execute on function chat.notify_change() from public, chat_user;

commit;
