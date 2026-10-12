-- Creates the workspace with its #general channel and invites the owner. No demo data.
-- Run by `npm run db:seed` (scripts/migrate.mjs), which sets chat.seed_owner_email
-- from OWNER_EMAIL and chat.seed_workspace from WORKSPACE_NAME. Safe to re-run.
begin;
set local search_path to chat, public;

insert into workspaces (name, slug)
select current_setting('chat.seed_workspace'),
       trim(both '-' from regexp_replace(lower(current_setting('chat.seed_workspace')), '[^a-z0-9]+', '-', 'g'))
 where not exists (select 1 from workspaces)
on conflict (slug) do nothing;

insert into conversations (workspace_id, kind, name, topic)
select w.id, 'public_channel', 'general', 'Announcements for the whole team'
  from workspaces w
on conflict (workspace_id, name) do nothing;

-- The owner signs in with an email code and becomes owner on first sign-in (no owner exists yet).
insert into invitations (workspace_id, email, role, token_hash, expires_at)
select w.id, lower(current_setting('chat.seed_owner_email')), 'admin',
       encode(gen_random_bytes(24), 'hex'), now() + interval '30 days'
  from workspaces w
 where current_setting('chat.seed_owner_email', true) <> ''
   and not exists (select 1 from workspace_members m where m.workspace_id = w.id and m.role = 'owner')
   and not exists (select 1 from invitations i
                    where i.workspace_id = w.id and i.email = lower(current_setting('chat.seed_owner_email'))
                      and i.status = 'pending');

commit;
