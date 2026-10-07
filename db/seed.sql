-- Creates the Northwind workspace, demo teammates and a few conversations,
-- and invites the owner. Run by `npm run db:seed` (scripts/migrate.mjs),
-- which sets chat.seed_owner_email from OWNER_EMAIL. Safe to re-run.
begin;
set local search_path to chat, public;

insert into workspaces (name, slug, description)
values ('Northwind', 'northwind', 'Team workspace')
on conflict (slug) do nothing;

insert into conversations (workspace_id, kind, name, topic)
select w.id, 'public_channel', v.name, v.topic
  from workspaces w,
       (values ('general',      'Announcements for the whole team'),
               ('random',       'Off-topic welcome'),
               ('product',      'Roadmap, specs, customer feedback'),
               ('design',       'Reviews, mockups, design system'),
               ('eng-frontend', 'Next.js · shadcn/ui · perf'),
               ('deploys',      'CI/CD notifications')) as v(name, topic)
 where w.slug = 'northwind'
on conflict (workspace_id, name) do nothing;

-- Demo teammates. Any of these emails can sign in too (the code is printed in the server log).
insert into users (email, display_name, title, timezone, status_emoji, status_text)
values ('sarah@northwind.test', 'Sarah Chen',   'Product Manager',    'Europe/Paris',     '🎯', 'Planning Q4'),
       ('marc@northwind.test',  'Marc Dubois',  'Frontend Engineer',  'Europe/Paris',     null, null),
       ('aisha@northwind.test', 'Aisha Khan',   'Product Designer',   'Europe/London',    '🎨', 'In Figma'),
       ('leo@northwind.test',   'Leo Martin',   'Backend Engineer',   'America/New_York', null, null)
on conflict (email) do nothing;

insert into workspace_members (workspace_id, user_id, role)
select w.id, u.id, case when u.email = 'sarah@northwind.test' then 'admin'::member_role else 'member' end
  from workspaces w, users u
 where w.slug = 'northwind' and u.email like '%@northwind.test'
on conflict do nothing;

insert into user_preferences (user_id, workspace_id)
select u.id, w.id from workspaces w, users u
 where w.slug = 'northwind' and u.email like '%@northwind.test'
on conflict do nothing;

-- Everyone in every public channel except #deploys (Marc and Leo only).
insert into conversation_members (conversation_id, user_id)
select c.id, u.id
  from conversations c join workspaces w on w.id = c.workspace_id, users u
 where w.slug = 'northwind' and c.kind = 'public_channel' and u.email like '%@northwind.test'
   and (c.name <> 'deploys' or u.email in ('marc@northwind.test', 'leo@northwind.test'))
on conflict do nothing;

-- Demo messages, only on the first run.
do $$
declare
  ws uuid := (select id from workspaces where slug = 'northwind');
  sarah uuid := (select id from users where email = 'sarah@northwind.test');
  marc  uuid := (select id from users where email = 'marc@northwind.test');
  aisha uuid := (select id from users where email = 'aisha@northwind.test');
  leo   uuid := (select id from users where email = 'leo@northwind.test');
  general uuid := (select id from conversations where workspace_id = ws and name = 'general');
  product uuid := (select id from conversations where workspace_id = ws and name = 'product');
  design  uuid := (select id from conversations where workspace_id = ws and name = 'design');
  front   uuid := (select id from conversations where workspace_id = ws and name = 'eng-frontend');
  dm uuid;
  root messages;
begin
  if exists (select 1 from messages m join conversations c on c.id = m.conversation_id where c.workspace_id = ws) then
    return;
  end if;

  perform _insert_message(sarah, general, 'Welcome to Northwind 👋 This is where team-wide announcements go.', null, false, null);
  perform _insert_message(marc,  general, 'Morning all! Coffee machine on 3rd floor is fixed ☕', null, false, null);
  root := _insert_message(sarah, general, 'Reminder: all-hands Thursday 4pm. Send me topics before Wednesday @channel', null, false, null);
  perform _insert_message(leo,   general, 'Can we cover the new on-call rotation?', root.id, false, null);
  perform _insert_message(sarah, general, 'Yes, added to the agenda.', root.id, false, null);

  root := _insert_message(sarah, product, 'Draft spec for threaded notifications is up. Feedback welcome by Friday.', null, false, null);
  perform _insert_message(aisha, product, 'Left comments on the empty states, mostly copy.', root.id, false, null);
  perform _insert_message(marc,  product, 'Looks good from the frontend side. Realtime part is straightforward.', root.id, true, null);

  perform _insert_message(aisha, design, 'New sidebar iteration: tighter spacing, unread badges in violet. Thoughts?', null, false, null);
  perform _insert_message(sarah, design, 'Love it. @Aisha Khan can we try the badge in green too?', null, false, null);

  perform _insert_message(marc, front, 'Upgraded to Next 16, proxy.ts replaces middleware.ts now.', null, false, null);
  perform _insert_message(leo,  front, 'Nice. API is plain Postgres now, no more Supabase client.', null, false, null);

  insert into conversations (workspace_id, kind, created_by) values (ws, 'dm', marc) returning id into dm;
  insert into conversation_members (conversation_id, user_id) values (dm, marc), (dm, leo);
  perform _insert_message(marc, dm, 'Hey Leo, do you have 10 min to pair on the SSE endpoint?', null, false, null);
  perform _insert_message(leo,  dm, 'Sure, after lunch?', null, false, null);
end $$;

-- The owner signs in with an email code. Role becomes owner on first sign-in (no owner exists yet).
insert into invitations (workspace_id, email, role, token_hash, expires_at)
select w.id, lower(current_setting('chat.seed_owner_email')), 'admin',
       encode(gen_random_bytes(24), 'hex'), now() + interval '30 days'
  from workspaces w
 where w.slug = 'northwind'
   and current_setting('chat.seed_owner_email', true) <> ''
   and not exists (select 1 from invitations i
                    where i.workspace_id = w.id and i.email = lower(current_setting('chat.seed_owner_email'))
                      and i.status = 'pending')
   and not exists (select 1 from workspace_members m join users u on u.id = m.user_id
                    where m.workspace_id = w.id and u.email = lower(current_setting('chat.seed_owner_email')));

commit;
