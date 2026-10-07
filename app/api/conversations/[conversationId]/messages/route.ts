import { z } from 'zod';
import { requireUser, requireConversation } from '@/lib/auth';
import { route, ok, body, query, db, uuid } from '@/lib/http';
import { MESSAGE_SELECT, serializeMessages } from '@/lib/messages';

type P = { conversationId: string };

const Q = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Timeline, newest page first: ?before=<message id>&limit=50. Returned oldest → newest. */
export const GET = route<P>(async (req, { conversationId }) => {
  const { sb, uid } = await requireUser(req);
  await requireConversation(sb, conversationId);
  const { before, limit } = query(req, Q);
  let q = sb
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .or('parent_id.is.null,also_sent_to_channel.is.true')
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (before) q = q.lt('id', before);
  const rows = db(await q);
  const page = rows.slice(0, limit).reverse();
  return ok({
    messages: await serializeMessages(page, uid),
    next_before: rows.length > limit ? page[0].id : null,
  });
});

const Post = z.object({
  text: z.string().max(40_000).default(''),
  file_ids: z.array(uuid).max(10).default([]),
});

/** Send a message. Mentions are parsed, the draft is cleared, my read marker moves. */
export const POST = route<P>(async (req, { conversationId }) => {
  const { sb, uid } = await requireUser(req);
  const { text, file_ids } = await body(req, Post);
  const msg = db(
    await sb
      .rpc('post_message', { p_conv: conversationId, p_body: text, p_parent: null, p_also: false, p_files: file_ids })
      .select(MESSAGE_SELECT)
      .single(),
  );
  return ok((await serializeMessages([msg], uid))[0], 201);
});
