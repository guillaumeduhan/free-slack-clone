-- =====================================================================
-- Team Chat · keep reply counts in sync whoever deletes the replies.
-- Cascading deletes (workspace, channel) remove replies as chat_user, which
-- has no UPDATE grant on messages.reply_count: run the trigger as its owner.
-- =====================================================================
begin;
alter function chat.sync_reply_count() security definer set search_path = chat, public;
revoke execute on function chat.sync_reply_count() from public, chat_user;
commit;
