import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, query, db, check, messageId } from '@/lib/http';
import { summarizeReactions } from '@/lib/messages';
import type { DB } from '@/lib/supabase';

type P = { messageId: string };
const Emoji = z.object({ emoji: z.string().trim().min(1).max(32) });

async function summary(sb: DB, id: number, uid: string) {
  return summarizeReactions(db(await sb.from('reactions').select('emoji, user_id').eq('message_id', id).order('created_at')), uid);
}

/** Add my reaction (idempotent). Returns the message's reaction summary. */
export const POST = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const id = messageId(p.messageId);
  const { emoji } = await body(req, Emoji);
  check(await sb.from('reactions').upsert({ message_id: id, user_id: uid, emoji }, { ignoreDuplicates: true }));
  return ok(await summary(sb, id, uid), 201);
});

/** Remove my reaction: ?emoji=👍 */
export const DELETE = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const id = messageId(p.messageId);
  const { emoji } = query(req, Emoji);
  check(await sb.from('reactions').delete().eq('message_id', id).eq('user_id', uid).eq('emoji', emoji));
  return ok(await summary(sb, id, uid));
});
