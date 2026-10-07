-- =====================================================================
-- Team Chat · data the UI needs in one round trip
-- sidebar(): last message id (mark as read), my read marker (unread
-- mentions), member count (channel header).
-- =====================================================================
begin;
set local search_path to chat, public;

drop function if exists chat.sidebar(uuid);
create function chat.sidebar(p_ws uuid)
returns table (id uuid, kind chat.conversation_kind, name citext, topic text, description text, unread bigint,
               muted boolean, starred boolean, last_message_at timestamptz, last_message_id bigint,
               last_read_message_id bigint, member_count bigint, other_user_ids uuid[])
language sql stable security invoker set search_path = chat, public as $$
  select c.id, c.kind, c.name, c.topic, c.description, coalesce(u.unread, 0), cm.muted, cm.starred,
         lm.created_at, lm.id, cm.last_read_message_id,
         (select count(*) from conversation_members o where o.conversation_id = c.id),
         case when c.kind in ('dm', 'group_dm') then
           (select array_agg(o.user_id order by o.joined_at) from conversation_members o
             where o.conversation_id = c.id and o.user_id <> chat.uid()) end
    from conversation_members cm
    join conversations c on c.id = cm.conversation_id
    left join unread_counts u on u.conversation_id = c.id and u.user_id = chat.uid()
    left join lateral (
      select m.id, m.created_at from messages m
       where m.conversation_id = c.id and m.deleted_at is null and (m.parent_id is null or m.also_sent_to_channel)
       order by m.id desc limit 1) lm on true
   where cm.user_id = chat.uid() and c.workspace_id = p_ws and c.archived_at is null
   order by c.kind, c.name nulls last
$$;
grant execute on function chat.sidebar(uuid) to chat_user;

commit;
