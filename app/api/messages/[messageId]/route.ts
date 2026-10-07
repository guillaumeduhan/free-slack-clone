import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, db, messageId } from '@/lib/http';
import { MESSAGE_SELECT, serializeMessages } from '@/lib/messages';

type P = { messageId: string };

export const GET = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const row = db(await sb.from('messages').select(MESSAGE_SELECT).eq('id', messageId(p.messageId)).is('deleted_at', null).single());
  return ok((await serializeMessages([row], uid))[0]);
});

/** Edit my own message. */
export const PATCH = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const { text } = await body(req, z.object({ text: z.string().min(1).max(40_000) }));
  const row = db(
    await sb
      .from('messages')
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq('id', messageId(p.messageId))
      .eq('user_id', uid)
      .is('deleted_at', null)
      .select(MESSAGE_SELECT)
      .single(),
  );
  return ok((await serializeMessages([row], uid))[0]);
});

/** Delete my own message (soft delete: text is cleared, the row stays for thread integrity). */
export const DELETE = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const id = messageId(p.messageId);
  db(
    await sb
      .from('messages')
      .update({ body: '', deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', uid)
      .is('deleted_at', null)
      .select('id')
      .single(),
  );
  return ok({ deleted: id });
});
