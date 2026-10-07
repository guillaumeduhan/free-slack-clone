-- =====================================================================
-- Team Chat · access layer
-- Grants, row-level security and RPC functions. Runs after 0001_schema.sql.
-- chat.uid() comes from 0000_roles.sql.
-- =====================================================================
begin;
set local search_path to chat, public;

-- ---------------------------------------------------------------------
-- Grants (RLS below decides which rows; column grants decide which fields)
-- ---------------------------------------------------------------------
grant usage on schema chat to chat_user;
grant select, insert, delete on all tables in schema chat to chat_user;
grant usage, select on all sequences in schema chat to chat_user;

grant update (name, slug, description, logo_url)                      on workspaces           to chat_user;
grant update (display_name, title, avatar_url, timezone, status_text, status_emoji, last_seen_at) on users to chat_user;
grant update (status)                                                 on invitations          to chat_user;
grant update (theme, notify_level, desktop_enabled, sound_enabled, email_digest, dnd_enabled, dnd_start, dnd_end) on user_preferences to chat_user;
grant update (name, topic, description, archived_at)                  on conversations        to chat_user;
grant update (last_read_message_id, muted, notify_level, starred)     on conversation_members to chat_user;
grant update (body, edited_at, deleted_at)                            on messages             to chat_user;
grant update (body, updated_at)                                       on drafts               to chat_user;
grant update (name, description, default_conversation_id)             on apps                 to chat_user;

alter view unread_counts set (security_invoker = true);

-- ---------------------------------------------------------------------
-- Helpers (security definer so policies can use them without recursion)
-- ---------------------------------------------------------------------
create or replace function chat.hash_secret(p text) returns text
language sql immutable set search_path = chat, public as $$
  select encode(digest(p, 'sha256'), 'hex')
$$;

create or replace function chat.my_role(p_ws uuid) returns chat.member_role
language sql stable security definer set search_path = chat, public as $$
  select role from chat.workspace_members
   where workspace_id = p_ws and user_id = chat.uid() and deactivated_at is null
$$;

create or replace function chat.is_ws_member(p_ws uuid) returns boolean
language sql stable security definer set search_path = chat, public as $$
  select chat.my_role(p_ws) is not null
$$;

create or replace function chat.is_conv_member(p_conv uuid) returns boolean
language sql stable security definer set search_path = chat, public as $$
  select exists (select 1 from chat.conversation_members
                  where conversation_id = p_conv and user_id = chat.uid())
$$;

create or replace function chat.can_read_conv(p_conv uuid) returns boolean
language sql stable security definer set search_path = chat, public as $$
  select exists (
    select 1 from chat.conversations c
     where c.id = p_conv
       and (chat.is_conv_member(c.id)
            or (c.kind = 'public_channel' and chat.is_ws_member(c.workspace_id))))
$$;

create or replace function chat.can_read_message(p_msg bigint) returns boolean
language sql stable security definer set search_path = chat, public as $$
  select exists (select 1 from chat.messages m
                  where m.id = p_msg and chat.can_read_conv(m.conversation_id))
$$;

create or replace function chat.shares_workspace(p_user uuid) returns boolean
language sql stable security definer set search_path = chat, public as $$
  select p_user = chat.uid() or exists (
    select 1 from chat.workspace_members a
      join chat.workspace_members b on b.workspace_id = a.workspace_id
     where a.user_id = chat.uid() and a.deactivated_at is null and b.user_id = p_user)
$$;

create or replace function chat.require_role(p_ws uuid, p_roles chat.member_role[])
returns chat.member_role
language plpgsql stable security definer set search_path = chat, public as $$
declare r member_role := my_role(p_ws);
begin
  if chat.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if r is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  if not (r = any (p_roles)) then raise exception 'Requires role: %', array_to_string(p_roles, ' or ') using errcode = '42501'; end if;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['workspaces','users','workspace_members','invitations','user_preferences',
    'conversations','conversation_members','messages','reactions','mentions','drafts','saved_items',
    'files','message_files','apps','app_tokens','webhooks'] loop
    execute format('alter table chat.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists ws_select on workspaces;
create policy ws_select on workspaces for select using (is_ws_member(id));
drop policy if exists ws_update on workspaces;
create policy ws_update on workspaces for update
  using (my_role(id) in ('owner', 'admin')) with check (my_role(id) in ('owner', 'admin'));
drop policy if exists ws_delete on workspaces;
create policy ws_delete on workspaces for delete using (my_role(id) = 'owner');

drop policy if exists users_select on users;
create policy users_select on users for select using (shares_workspace(id));
drop policy if exists users_update on users;
create policy users_update on users for update using (id = chat.uid()) with check (id = chat.uid() and not is_bot);

drop policy if exists wm_select on workspace_members;
create policy wm_select on workspace_members for select using (is_ws_member(workspace_id));

drop policy if exists inv_admin on invitations;
create policy inv_admin on invitations for all
  using (my_role(workspace_id) in ('owner', 'admin')) with check (my_role(workspace_id) in ('owner', 'admin'));

drop policy if exists prefs_own on user_preferences;
create policy prefs_own on user_preferences for all
  using (user_id = chat.uid()) with check (user_id = chat.uid() and is_ws_member(workspace_id));

drop policy if exists conv_select on conversations;
create policy conv_select on conversations for select using (can_read_conv(id));
drop policy if exists conv_update on conversations;
create policy conv_update on conversations for update using (is_conv_member(id)) with check (is_conv_member(id));

drop policy if exists cm_select on conversation_members;
create policy cm_select on conversation_members for select using (can_read_conv(conversation_id));
drop policy if exists cm_join on conversation_members;
create policy cm_join on conversation_members for insert with check (
  user_id = chat.uid() and exists (
    select 1 from conversations c
     where c.id = conversation_id and c.kind = 'public_channel' and is_ws_member(c.workspace_id)));
drop policy if exists cm_update on conversation_members;
create policy cm_update on conversation_members for update using (user_id = chat.uid()) with check (user_id = chat.uid());
drop policy if exists cm_delete on conversation_members;
create policy cm_delete on conversation_members for delete using (
  user_id = chat.uid() or exists (
    select 1 from conversations c
     where c.id = conversation_id and my_role(c.workspace_id) in ('owner', 'admin')));

drop policy if exists msg_select on messages;
create policy msg_select on messages for select using (can_read_conv(conversation_id));
drop policy if exists msg_update on messages;
create policy msg_update on messages for update using (user_id = chat.uid()) with check (user_id = chat.uid());

drop policy if exists rx_select on reactions;
create policy rx_select on reactions for select using (can_read_message(message_id));
drop policy if exists rx_insert on reactions;
create policy rx_insert on reactions for insert with check (user_id = chat.uid() and can_read_message(message_id));
drop policy if exists rx_delete on reactions;
create policy rx_delete on reactions for delete using (user_id = chat.uid());

drop policy if exists mn_select on mentions;
create policy mn_select on mentions for select using (can_read_message(message_id));

drop policy if exists drafts_own on drafts;
create policy drafts_own on drafts for all
  using (user_id = chat.uid()) with check (user_id = chat.uid() and can_read_conv(conversation_id));

drop policy if exists saved_own on saved_items;
create policy saved_own on saved_items for all
  using (user_id = chat.uid()) with check (user_id = chat.uid() and can_read_message(message_id));

drop policy if exists files_select on files;
create policy files_select on files for select using (is_ws_member(workspace_id));
drop policy if exists files_insert on files;
create policy files_insert on files for insert with check (uploader_id = chat.uid() and is_ws_member(workspace_id));

drop policy if exists mf_select on message_files;
create policy mf_select on message_files for select using (can_read_message(message_id));

drop policy if exists apps_select on apps;
create policy apps_select on apps for select using (is_ws_member(workspace_id));
drop policy if exists apps_update on apps;
create policy apps_update on apps for update
  using (my_role(workspace_id) in ('owner', 'admin')) with check (my_role(workspace_id) in ('owner', 'admin'));

drop policy if exists tok_select on app_tokens;
create policy tok_select on app_tokens for select using (
  exists (select 1 from apps a where a.id = app_id and my_role(a.workspace_id) in ('owner', 'admin')));
drop policy if exists wh_select on webhooks;
create policy wh_select on webhooks for select using (
  exists (select 1 from apps a where a.id = app_id and my_role(a.workspace_id) in ('owner', 'admin')));

-- ---------------------------------------------------------------------
-- Workspaces & membership
-- ---------------------------------------------------------------------
create or replace function chat.create_workspace(p_name text, p_slug citext) returns chat.workspaces
language plpgsql security definer set search_path = chat, public as $$
declare ws workspaces; conv uuid;
begin
  if chat.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  insert into workspaces (name, slug) values (p_name, p_slug) returning * into ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws.id, chat.uid(), 'owner');
  insert into user_preferences (user_id, workspace_id) values (chat.uid(), ws.id);
  insert into conversations (workspace_id, kind, name, topic, created_by)
    values (ws.id, 'public_channel', 'general', 'Announcements for the whole team', chat.uid())
    returning id into conv;
  insert into conversation_members (conversation_id, user_id) values (conv, chat.uid());
  return ws;
end $$;

create or replace function chat.transfer_ownership(p_ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path = chat, public as $$
begin
  perform require_role(p_ws, '{owner}');
  if not exists (select 1 from workspace_members
                  where workspace_id = p_ws and user_id = p_user and deactivated_at is null
                    and user_id not in (select id from users where is_bot)) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  update workspace_members set role = 'admin' where workspace_id = p_ws and role = 'owner';
  update workspace_members set role = 'owner' where workspace_id = p_ws and user_id = p_user;
end $$;

create or replace function chat.set_member_role(p_ws uuid, p_user uuid, p_role chat.member_role) returns void
language plpgsql security definer set search_path = chat, public as $$
begin
  perform require_role(p_ws, '{owner,admin}');
  if p_role = 'owner' then
    raise exception 'Use transfer_ownership to change the owner' using errcode = '22023';
  end if;
  update workspace_members set role = p_role
   where workspace_id = p_ws and user_id = p_user and deactivated_at is null and role <> 'owner';
  if not found then raise exception 'Member not found, or is the owner' using errcode = 'P0002'; end if;
end $$;

create or replace function chat.remove_member(p_ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path = chat, public as $$
begin
  if p_user is distinct from chat.uid() then perform require_role(p_ws, '{owner,admin}'); end if;
  update workspace_members set deactivated_at = now()
   where workspace_id = p_ws and user_id = p_user and role <> 'owner' and deactivated_at is null;
  if not found then raise exception 'Member not found, or is the owner' using errcode = 'P0002'; end if;
  delete from conversation_members cm using conversations c
   where c.id = cm.conversation_id and c.workspace_id = p_ws and cm.user_id = p_user;
end $$;

create or replace function chat.create_invitation(p_ws uuid, p_email citext, p_role chat.member_role default 'member')
returns jsonb
language plpgsql security definer set search_path = chat, public as $$
declare tok text := encode(gen_random_bytes(24), 'hex'); inv invitations;
begin
  perform require_role(p_ws, '{owner,admin}');
  if p_role = 'owner' then raise exception 'Invitations cannot grant owner' using errcode = '22023'; end if;
  if exists (select 1 from workspace_members wm join users u on u.id = wm.user_id
              where wm.workspace_id = p_ws and u.email = p_email and wm.deactivated_at is null) then
    raise exception 'Already a member' using errcode = '23505';
  end if;
  update invitations set status = 'revoked' where workspace_id = p_ws and email = p_email and status = 'pending';
  insert into invitations (workspace_id, email, role, invited_by, token_hash)
    values (p_ws, p_email, p_role, chat.uid(), hash_secret(tok)) returning * into inv;
  return jsonb_build_object('invitation', to_jsonb(inv) - 'token_hash', 'token', tok);
end $$;

create or replace function chat.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = chat, public as $$
declare inv invitations; me users;
begin
  select * into me from users where id = chat.uid();
  if me.id is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into inv from invitations where token_hash = hash_secret(p_token) for update;
  if inv.id is null or inv.status <> 'pending' or inv.expires_at < now() then
    raise exception 'Invitation not found or expired' using errcode = 'P0002';
  end if;
  if me.email is distinct from inv.email then
    raise exception 'This invitation was sent to another email address' using errcode = '42501';
  end if;
  insert into workspace_members (workspace_id, user_id, role) values (inv.workspace_id, me.id, inv.role)
    on conflict (workspace_id, user_id) do update
      set deactivated_at = null,
          role = case when workspace_members.role = 'owner' then 'owner'::member_role else excluded.role end;
  insert into user_preferences (user_id, workspace_id) values (me.id, inv.workspace_id) on conflict do nothing;
  insert into conversation_members (conversation_id, user_id)
    select id, me.id from conversations
     where workspace_id = inv.workspace_id and kind = 'public_channel' and name = 'general'
    on conflict do nothing;
  update invitations set status = 'accepted' where id = inv.id;
  return inv.workspace_id;
end $$;

-- ---------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------
create or replace function chat.create_channel(p_ws uuid, p_name citext, p_private boolean default false, p_topic text default null)
returns chat.conversations
language plpgsql security definer set search_path = chat, public as $$
declare c conversations;
begin
  perform require_role(p_ws, '{owner,admin,member}');
  insert into conversations (workspace_id, kind, name, topic, created_by)
    values (p_ws, case when p_private then 'private_channel'::conversation_kind else 'public_channel' end,
            lower(p_name::text), p_topic, chat.uid())
    returning * into c;
  insert into conversation_members (conversation_id, user_id) values (c.id, chat.uid());
  return c;
end $$;

create or replace function chat.open_dm(p_ws uuid, p_users uuid[]) returns chat.conversations
language plpgsql security definer set search_path = chat, public as $$
declare ids uuid[]; c conversations;
begin
  perform require_role(p_ws, '{owner,admin,member}');
  select array_agg(distinct u order by u) into ids from unnest(array_append(p_users, chat.uid())) u;
  if cardinality(ids) > 9 then raise exception 'Group DMs are limited to 9 people' using errcode = '22023'; end if;
  if exists (select 1 from unnest(ids) u
              where not exists (select 1 from workspace_members wm
                                 where wm.workspace_id = p_ws and wm.user_id = u and wm.deactivated_at is null)) then
    raise exception 'Everyone must be a member of the workspace' using errcode = '22023';
  end if;
  select cv.* into c from conversations cv
   where cv.workspace_id = p_ws and cv.kind in ('dm', 'group_dm')
     and (select array_agg(cm.user_id order by cm.user_id)
            from conversation_members cm where cm.conversation_id = cv.id) = ids
   limit 1;
  if c.id is null then
    insert into conversations (workspace_id, kind, created_by)
      values (p_ws, case when cardinality(ids) <= 2 then 'dm'::conversation_kind else 'group_dm' end, chat.uid())
      returning * into c;
    insert into conversation_members (conversation_id, user_id) select c.id, u from unnest(ids) u;
  end if;
  return c;
end $$;

create or replace function chat.add_conversation_members(p_conv uuid, p_users uuid[]) returns integer
language plpgsql security definer set search_path = chat, public as $$
declare c conversations; n integer;
begin
  select * into c from conversations where id = p_conv;
  if c.id is null or not can_read_conv(p_conv) then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  if c.kind not in ('public_channel', 'private_channel') then
    raise exception 'Members can only be added to channels' using errcode = '22023';
  end if;
  if not is_conv_member(p_conv) then raise exception 'Join the channel first' using errcode = '42501'; end if;
  insert into conversation_members (conversation_id, user_id)
    select p_conv, wm.user_id from workspace_members wm
     where wm.workspace_id = c.workspace_id and wm.deactivated_at is null and wm.user_id = any (p_users)
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function chat.mark_read(p_conv uuid, p_message bigint) returns void
language sql security invoker set search_path = chat, public as $$
  update conversation_members
     set last_read_message_id = greatest(coalesce(last_read_message_id, 0), p_message)
   where conversation_id = p_conv and user_id = chat.uid()
$$;

create or replace function chat.sidebar(p_ws uuid)
returns table (id uuid, kind chat.conversation_kind, name citext, topic text, unread bigint,
               muted boolean, starred boolean, last_message_at timestamptz, other_user_ids uuid[])
language sql stable security invoker set search_path = chat, public as $$
  select c.id, c.kind, c.name, c.topic, coalesce(u.unread, 0), cm.muted, cm.starred,
         (select max(m.created_at) from messages m where m.conversation_id = c.id),
         case when c.kind in ('dm', 'group_dm') then
           (select array_agg(o.user_id) from conversation_members o
             where o.conversation_id = c.id and o.user_id <> chat.uid()) end
    from conversation_members cm
    join conversations c on c.id = cm.conversation_id
    left join unread_counts u on u.conversation_id = c.id and u.user_id = chat.uid()
   where cm.user_id = chat.uid() and c.workspace_id = p_ws and c.archived_at is null
   order by c.kind, c.name nulls last
$$;

-- ---------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------
-- Internal: inserts a message with files, mentions and draft cleanup.
-- Not callable by clients (see grants at the bottom).
create or replace function chat._insert_message(p_user uuid, p_conv uuid, p_body text, p_parent bigint,
                                                    p_also boolean, p_files uuid[])
returns chat.messages
language plpgsql security definer set search_path = chat, public as $$
declare m messages; ws uuid;
begin
  select workspace_id into ws from conversations where id = p_conv and archived_at is null;
  if ws is null then raise exception 'channel_not_found' using errcode = 'P0002'; end if;
  if p_parent is not null and not exists (
       select 1 from messages where id = p_parent and conversation_id = p_conv and parent_id is null) then
    raise exception 'thread_not_found' using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_body), '') = '' and coalesce(cardinality(p_files), 0) = 0 then
    raise exception 'Message is empty' using errcode = '22023';
  end if;

  insert into messages (conversation_id, user_id, parent_id, body, also_sent_to_channel)
    values (p_conv, p_user, p_parent, coalesce(p_body, ''), coalesce(p_also, false) and p_parent is not null)
    returning * into m;

  insert into message_files (message_id, file_id, position)
    select m.id, f.id, (x.ord - 1)::smallint
      from unnest(p_files) with ordinality as x(fid, ord)
      join files f on f.id = x.fid and f.workspace_id = ws;

  insert into mentions (message_id, kind)
    select m.id, k::mention_kind from (values ('channel'), ('here')) v(k)
     where m.body ~* ('(^|\s)@' || k || '\M');

  insert into mentions (message_id, user_id, kind)
    select m.id, u.id, 'user'
      from users u
      join workspace_members wm on wm.user_id = u.id and wm.workspace_id = ws and wm.deactivated_at is null
     where u.id <> p_user and position('@' || u.display_name in m.body) > 0;

  delete from drafts where user_id = p_user and conversation_id = p_conv and parent_id is not distinct from p_parent;
  update conversation_members set last_read_message_id = m.id where conversation_id = p_conv and user_id = p_user;
  return m;
end $$;

create or replace function chat.post_message(p_conv uuid, p_body text, p_parent bigint default null,
                                                 p_also boolean default false, p_files uuid[] default '{}')
returns chat.messages
language plpgsql security definer set search_path = chat, public as $$
begin
  if chat.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not is_conv_member(p_conv) then
    if exists (select 1 from conversations where id = p_conv and kind = 'public_channel' and is_ws_member(workspace_id)) then
      insert into conversation_members (conversation_id, user_id) values (p_conv, chat.uid()) on conflict do nothing;
    else
      raise exception 'Not a member of this conversation' using errcode = '42501';
    end if;
  end if;
  if exists (select 1 from files where id = any (p_files) and uploader_id is distinct from chat.uid()) then
    raise exception 'You can only attach your own uploads' using errcode = '42501';
  end if;
  return _insert_message(chat.uid(), p_conv, p_body, p_parent, p_also, p_files);
end $$;

create or replace function chat.search_messages(p_ws uuid, p_q text, p_limit integer default 20)
returns setof chat.messages
language sql stable security invoker set search_path = chat, public as $$
  select m.* from messages m
    join conversations c on c.id = m.conversation_id
   where c.workspace_id = p_ws and m.deleted_at is null
     and to_tsvector('simple', m.body) @@ websearch_to_tsquery('simple', p_q)
   order by m.created_at desc
   limit least(p_limit, 50)
$$;

-- Mentions / Threads / Activity / Saved views in the sidebar.
create or replace function chat.feed(p_ws uuid, p_kind text, p_limit integer default 50)
returns table (item text, message_id bigint, parent_id bigint, conversation_id uuid, actor_id uuid,
               body text, emoji text, created_at timestamptz)
language sql stable security invoker set search_path = chat, public as $$
  with convs as (select id from conversations where workspace_id = p_ws),
  mentioned as (
    select 'mention'::text, m.id, m.parent_id, m.conversation_id, m.user_id, m.body, null::text, m.created_at
      from mentions x join messages m on m.id = x.message_id
     where m.conversation_id in (select id from convs) and m.deleted_at is null and m.user_id <> chat.uid()
       and (x.user_id = chat.uid() or x.kind in ('channel', 'here'))),
  threads as (
    select distinct on (r.parent_id)
           'thread'::text, r.id, r.parent_id, r.conversation_id, r.user_id, r.body, null::text, r.created_at
      from messages r join messages root on root.id = r.parent_id
     where r.conversation_id in (select id from convs) and r.deleted_at is null and r.user_id <> chat.uid()
       and (root.user_id = chat.uid()
            or exists (select 1 from messages mine where mine.parent_id = root.id and mine.user_id = chat.uid()))
     order by r.parent_id, r.created_at desc),
  reacted as (
    select 'reaction'::text, m.id, m.parent_id, m.conversation_id, x.user_id, m.body, x.emoji, x.created_at
      from reactions x join messages m on m.id = x.message_id
     where m.user_id = chat.uid() and x.user_id <> chat.uid() and m.conversation_id in (select id from convs)),
  saved as (
    select 'saved'::text, m.id, m.parent_id, m.conversation_id, m.user_id, m.body, null::text, s.created_at
      from saved_items s join messages m on m.id = s.message_id
     where s.user_id = chat.uid() and m.conversation_id in (select id from convs) and m.deleted_at is null)
  select * from (
    select * from mentioned where p_kind in ('mentions', 'activity')
    union all select * from threads where p_kind in ('threads', 'activity')
    union all select * from reacted where p_kind = 'activity'
    union all select * from saved where p_kind = 'saved'
  ) f
  order by created_at desc
  limit least(p_limit, 200)
$$;

-- ---------------------------------------------------------------------
-- Apps, agents & bots
-- ---------------------------------------------------------------------
create or replace function chat.create_app(p_ws uuid, p_name text, p_kind chat.app_kind default 'app',
                                               p_description text default null, p_default_conv uuid default null)
returns jsonb
language plpgsql security definer set search_path = chat, public as $$
declare bot uuid; a apps; tok text := 'xoxb-' || encode(gen_random_bytes(24), 'hex'); sec text;
begin
  perform require_role(p_ws, '{owner,admin}');
  if p_default_conv is not null and not exists (
       select 1 from conversations where id = p_default_conv and workspace_id = p_ws) then
    raise exception 'Default channel not found' using errcode = 'P0002';
  end if;
  insert into users (display_name, title, is_bot) values (p_name, initcap(p_kind::text), true) returning id into bot;
  insert into workspace_members (workspace_id, user_id, role) values (p_ws, bot, 'member');
  insert into apps (workspace_id, bot_user_id, kind, name, description, default_conversation_id, created_by)
    values (p_ws, bot, p_kind, p_name, p_description, p_default_conv, chat.uid())
    returning * into a;
  insert into app_tokens (app_id, token_prefix, token_hash) values (a.id, left(tok, 12), hash_secret(tok));
  if p_default_conv is not null then
    sec := encode(gen_random_bytes(24), 'hex');
    insert into conversation_members (conversation_id, user_id) values (p_default_conv, bot) on conflict do nothing;
    insert into webhooks (app_id, conversation_id, secret_hash) values (a.id, p_default_conv, hash_secret(sec));
  end if;
  return jsonb_build_object('app', to_jsonb(a), 'token', tok, 'webhook_secret', sec);
end $$;

create or replace function chat.rotate_app_token(p_app uuid) returns text
language plpgsql security definer set search_path = chat, public as $$
declare a apps; tok text := 'xoxb-' || encode(gen_random_bytes(24), 'hex');
begin
  select * into a from apps where id = p_app;
  if a.id is null then raise exception 'App not found' using errcode = 'P0002'; end if;
  perform require_role(a.workspace_id, '{owner,admin}');
  update app_tokens set revoked_at = now() where app_id = p_app and revoked_at is null;
  insert into app_tokens (app_id, token_prefix, token_hash) values (p_app, left(tok, 12), hash_secret(tok));
  return tok;
end $$;

create or replace function chat.delete_app(p_app uuid) returns void
language plpgsql security definer set search_path = chat, public as $$
declare a apps;
begin
  select * into a from apps where id = p_app;
  if a.id is null then raise exception 'App not found' using errcode = 'P0002'; end if;
  perform require_role(a.workspace_id, '{owner,admin}');
  update workspace_members set deactivated_at = now() where workspace_id = a.workspace_id and user_id = a.bot_user_id;
  delete from conversation_members where user_id = a.bot_user_id;
  delete from apps where id = p_app;  -- tokens and webhooks cascade; past messages stay
end $$;

-- Bot API (Authorization: Bearer xoxb-…). Server only (not granted to chat_user).
create or replace function chat.bot_post_message(p_token text, p_channel text, p_text text, p_thread bigint default null)
returns chat.messages
language plpgsql security definer set search_path = chat, public as $$
declare a apps; conv conversations;
begin
  select ap.* into a from app_tokens t join apps ap on ap.id = t.app_id
   where t.token_hash = hash_secret(p_token) and t.revoked_at is null and 'chat:write' = any (t.scopes);
  if a.id is null then raise exception 'invalid_auth' using errcode = '28000'; end if;
  update app_tokens set last_used_at = now() where token_hash = hash_secret(p_token);

  select c.* into conv from conversations c
   where c.workspace_id = a.workspace_id and c.archived_at is null
     and (c.id::text = p_channel or c.name = ltrim(p_channel, '#'));
  if conv.id is null then raise exception 'channel_not_found' using errcode = 'P0002'; end if;

  if not exists (select 1 from conversation_members where conversation_id = conv.id and user_id = a.bot_user_id) then
    if conv.kind <> 'public_channel' then raise exception 'not_in_channel' using errcode = '42501'; end if;
    insert into conversation_members (conversation_id, user_id) values (conv.id, a.bot_user_id);
  end if;
  return _insert_message(a.bot_user_id, conv.id, p_text, p_thread, false, null);
end $$;

-- Incoming webhook (POST /api/hooks/:secret). Server only (not granted to chat_user).
create or replace function chat.webhook_post_message(p_secret text, p_text text) returns chat.messages
language plpgsql security definer set search_path = chat, public as $$
declare w webhooks; bot uuid;
begin
  select * into w from webhooks where secret_hash = hash_secret(p_secret) and disabled_at is null;
  if w.id is null then raise exception 'invalid_webhook' using errcode = 'P0002'; end if;
  select bot_user_id into bot from apps where id = w.app_id;
  insert into conversation_members (conversation_id, user_id) values (w.conversation_id, bot) on conflict do nothing;
  return _insert_message(bot, w.conversation_id, p_text, null, false, null);
end $$;

-- ---------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------
revoke execute on all functions in schema chat from public;
grant execute on all functions in schema chat to chat_user;
revoke execute on function chat._insert_message(uuid, uuid, text, bigint, boolean, uuid[]) from chat_user;
revoke execute on function chat.bot_post_message(text, text, text, bigint) from chat_user;
revoke execute on function chat.webhook_post_message(text, text) from chat_user;

commit;
