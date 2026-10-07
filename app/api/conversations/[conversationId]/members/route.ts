import { z } from 'zod';
import { requireUser, requireConversation } from '@/lib/auth';
import { route, ok, body, query, db, check, uuid } from '@/lib/http';

type P = { conversationId: string };

/** People in the conversation ("14 members" dialog). */
export const GET = route<P>(async (req, { conversationId }) => {
  const { sb } = await requireUser(req);
  await requireConversation(sb, conversationId);
  return ok(
    db(
      await sb
        .from('conversation_members')
        .select('joined_at, user:users(id, display_name, title, avatar_url, is_bot, status_emoji, last_seen_at)')
        .eq('conversation_id', conversationId)
        .order('joined_at'),
    ),
  );
});

/** Add people to a channel (caller must be in it). Send [] with join=true to join a public channel. */
export const POST = route<P>(async (req, { conversationId }) => {
  const { sb, uid } = await requireUser(req);
  const b = await body(req, z.object({ user_ids: z.array(uuid).max(100).default([]), join: z.boolean().default(false) }));
  if (b.join) {
    check(await sb.from('conversation_members').upsert({ conversation_id: conversationId, user_id: uid }, { ignoreDuplicates: true }));
    return ok({ joined: true });
  }
  const added = db(await sb.rpc('add_conversation_members', { p_conv: conversationId, p_users: b.user_ids }));
  return ok({ added });
});

/** Leave (no user_id) or, for admins, remove someone: ?user_id=… */
export const DELETE = route<P>(async (req, { conversationId }) => {
  const { sb, uid } = await requireUser(req);
  const { user_id } = query(req, z.object({ user_id: uuid.optional() }));
  const target = user_id ?? uid;
  db(
    await sb
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', target)
      .select('user_id')
      .single(),
  );
  return ok({ removed: target });
});
