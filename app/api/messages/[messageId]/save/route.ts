import { requireUser } from '@/lib/auth';
import { route, ok, messageId } from '@/lib/http';

type P = { messageId: string };

/** Save for later. */
export const PUT = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  await db((tx) => tx.exec('insert into saved_items (user_id, message_id) values ($1, $2) on conflict do nothing', [uid, id]));
  return ok({ saved: true, message_id: id });
});

export const DELETE = route<P>(async (req, p) => {
  const { uid, db } = await requireUser(req);
  const id = messageId(p.messageId);
  await db((tx) => tx.exec('delete from saved_items where user_id = $1 and message_id = $2', [uid, id]));
  return ok({ saved: false, message_id: id });
});
