import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, found, messageId } from '@/lib/http';
import { selectMessage, selectMessages } from '@/lib/messages';

type P = { messageId: string };

export const GET = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  const [msg] = await db((tx) => selectMessages(tx, uid, 'm.id = $1 and m.deleted_at is null', [id]));
  return ok(found(msg, 'Message not found'));
});

/** Edit my own message. */
export const PATCH = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  const { text } = await body(req, z.object({ text: z.string().min(1).max(40_000) }));
  return ok(
    await db(async (tx) => {
      found(
        await tx.maybe(
          `update messages set body = $3, edited_at = now()
            where id = $1 and user_id = $2 and deleted_at is null returning id`,
          [id, uid, text],
        ),
        'Message not found',
      );
      return selectMessage(tx, uid, id);
    }),
  );
});

/** Delete my own message (soft delete: text is cleared, the row stays for thread integrity). */
export const DELETE = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  await db(async (tx) =>
    found(
      await tx.maybe(
        `update messages set body = '', deleted_at = now()
          where id = $1 and user_id = $2 and deleted_at is null returning id`,
        [id, uid],
      ),
      'Message not found',
    ),
  );
  return ok({ deleted: id });
});
