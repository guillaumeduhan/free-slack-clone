import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, query, messageId } from '@/lib/http';
import { summarizeReactions } from '@/lib/messages';
import type { Tx } from '@/lib/db';

type P = { messageId: string };
const Emoji = z.object({ emoji: z.string().trim().min(1).max(32) });

const summary = async (tx: Tx, id: number, uid: string) =>
  summarizeReactions(
    await tx.many<{ emoji: string; user_id: string }>(
      'select emoji, user_id from reactions where message_id = $1 order by created_at', [id],
    ),
    uid,
  );

/** Add my reaction (idempotent). Returns the message's reaction summary. */
export const POST = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  const { emoji } = await body(req, Emoji);
  return ok(
    await db(async (tx) => {
      await tx.exec('insert into reactions (message_id, user_id, emoji) values ($1, $2, $3) on conflict do nothing', [id, uid, emoji]);
      return summary(tx, id, uid);
    }),
    201,
  );
});

/** Remove my reaction: ?emoji=👍 */
export const DELETE = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  const { emoji } = query(req, Emoji);
  return ok(
    await db(async (tx) => {
      await tx.exec('delete from reactions where message_id = $1 and user_id = $2 and emoji = $3', [id, uid, emoji]);
      return summary(tx, id, uid);
    }),
  );
});
