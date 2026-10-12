-- =====================================================================
-- Team Chat · roles and caller identity for plain PostgreSQL
-- Runs before 0001. Everything lives in the "chat" schema.
--
-- Every API request runs in a transaction that does:
--   set local role chat_user;
--   select set_config('chat.uid', '<user uuid>', true);
-- so row-level security and the RPC functions see the caller via chat.uid().
-- =====================================================================
begin;

create extension if not exists citext;
create extension if not exists pgcrypto;

create schema if not exists chat;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'chat_user') then create role chat_user nologin; end if;
end $$;

-- The app's login role switches to chat_user for each signed-in request.
do $$ begin
  execute format('grant chat_user to %I', current_user);
end $$;

grant usage on schema chat to chat_user;

create or replace function chat.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('chat.uid', true), '')::uuid
$$;

commit;
