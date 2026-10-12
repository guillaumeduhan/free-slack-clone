import { z } from 'zod';
import { requireUser, requireConversation } from '@/lib/auth';
import { route, ok, body, query, uuid } from '@/lib/http';
import { selectMessages, selectMessage } from '@/lib/messages';

type P = { conversationId: string };

const Q = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Timeline, newest page first: ?before=<message id>&limit=50. Returned oldest → newest. */
export const GET = route<P>(async (req, { conversationId }) => {
  const { uid, db } = await requireUser(req);
  const { before, limit } = query(req, Q);
  return ok(
    await db(async (tx) => {
      await requireConversation(tx, conversationId);
      const rows = await selectMessages(
        tx, uid,
        `m.conversation_id = $1 and m.deleted_at is null and (m.parent_id is null or m.also_sent_to_channel)
         and ($2::bigint is null or m.id < $2)`,
        [conversationId, before ?? null],
        `order by m.id desc limit ${limit + 1}`,
      );
      const page = rows.slice(0, limit).reverse();
      return { messages: page, next_before: rows.length > limit ? page[0].id : null };
    }),
  );
});

const Post = z.object({
  text: z.string().max(40_000).default(''),
  file_ids: z.array(uuid).max(10).default([]),
});

/** Send a message. Mentions are parsed, the draft is cleared, my read marker moves. */
export const POST = route<P>(async (req, { conversationId }) => {
  const { uid, db } = await requireUser(req);
  const { text, file_ids } = await body(req, Post);
  return ok(
    await db(async (tx) => {
      const m = await tx.maybe<{ id: number }>('select id from post_message($1, $2, null, false, $3::uuid[])', [conversationId, text, file_ids]);
      return selectMessage(tx, uid, m!.id);
    }),
    201,
  );
});
