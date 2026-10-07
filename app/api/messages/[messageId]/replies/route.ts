import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, found, messageId, uuid, HttpError } from '@/lib/http';
import { selectMessage, selectMessages } from '@/lib/messages';

type P = { messageId: string };

/** Thread panel: the root message and all replies, oldest first. */
export const GET = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  return ok(
    await db(async (tx) => {
      const root = found(await selectMessage(tx, uid, id), 'Message not found');
      const replies = await selectMessages(tx, uid, 'm.parent_id = $1 and m.deleted_at is null', [id]);
      return { root, replies };
    }),
  );
});

const Post = z.object({
  text: z.string().max(40_000).default(''),
  file_ids: z.array(uuid).max(10).default([]),
  also_send_to_channel: z.boolean().default(false),
});

/** Reply in thread; optionally also post it to the channel. */
export const POST = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  const b = await body(req, Post);
  return ok(
    await db(async (tx) => {
      const root = found(
        await tx.maybe<{ conversation_id: string; parent_id: number | null }>(
          'select conversation_id, parent_id from messages where id = $1', [id],
        ),
        'Message not found',
      );
      if (root.parent_id) throw new HttpError(422, 'Reply to the root message of the thread', 'invalid_value');
      const m = await tx.maybe<{ id: number }>(
        'select id from post_message($1, $2, $3, $4, $5::uuid[])',
        [root.conversation_id, b.text, id, b.also_send_to_channel, b.file_ids],
      );
      return selectMessage(tx, uid, m!.id);
    }),
    201,
  );
});
