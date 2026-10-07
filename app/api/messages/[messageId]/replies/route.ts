import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, db, messageId, uuid, HttpError } from '@/lib/http';
import { MESSAGE_SELECT, serializeMessages } from '@/lib/messages';

type P = { messageId: string };

/** Thread panel: the root message and all replies, oldest first. */
export const GET = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const id = messageId(p.messageId);
  const [root, replies] = await Promise.all([
    sb.from('messages').select(MESSAGE_SELECT).eq('id', id).single(),
    sb.from('messages').select(MESSAGE_SELECT).eq('parent_id', id).is('deleted_at', null).order('id'),
  ]);
  const [r, ...rs] = await serializeMessages([db(root), ...db(replies)], uid);
  return ok({ root: r, replies: rs });
});

const Post = z.object({
  text: z.string().max(40_000).default(''),
  file_ids: z.array(uuid).max(10).default([]),
  also_send_to_channel: z.boolean().default(false),
});

/** Reply in thread; optionally also post it to the channel. */
export const POST = route<P>(async (req, p) => {
  const { sb, uid } = await requireUser(req);
  const id = messageId(p.messageId);
  const b = await body(req, Post);
  const root = db(await sb.from('messages').select('id, conversation_id, parent_id').eq('id', id).single());
  if (root.parent_id) throw new HttpError(422, 'Reply to the root message of the thread', 'invalid_value');
  const msg = db(
    await sb
      .rpc('post_message', {
        p_conv: root.conversation_id,
        p_body: b.text,
        p_parent: id,
        p_also: b.also_send_to_channel,
        p_files: b.file_ids,
      })
      .select(MESSAGE_SELECT)
      .single(),
  );
  return ok((await serializeMessages([msg], uid))[0], 201);
});
