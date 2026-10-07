import { requireUser } from '@/lib/auth';
import { route, ok, check, messageId } from '@/lib/http';

type P = { messageId: string };

/** Save for later. */
export const PUT = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const id = messageId(p.messageId);
  check(await sb.from('saved_items').upsert({ user_id: uid, message_id: id }, { ignoreDuplicates: true }));
  return ok({ saved: true, message_id: id });
});

export const DELETE = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const id = messageId(p.messageId);
  check(await sb.from('saved_items').delete().eq('user_id', uid).eq('message_id', id));
  return ok({ saved: false, message_id: id });
});
