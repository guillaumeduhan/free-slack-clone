import { z } from 'zod';
import { requireUser, requireConversation } from '@/lib/auth';
import { route, ok, body, db } from '@/lib/http';

type P = { conversationId: string };

export const GET = route<P>(async (req, { conversationId }) => {
  const { sb, uid } = await requireUser(req);
  const conv = await requireConversation(sb, conversationId);
  const [{ count }, { data: me }] = await Promise.all([
    sb.from('conversation_members').select('*', { count: 'exact', head: true }).eq('conversation_id', conversationId),
    sb.from('conversation_members').select('last_read_message_id, muted, starred, notify_level').eq('conversation_id', conversationId).eq('user_id', uid).maybeSingle(),
  ]);
  return ok({ ...conv, member_count: count ?? 0, membership: me });
});

const Patch = z
  .object({
    name: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,80}$/),
    topic: z.string().max(250).nullable(),
    description: z.string().max(1000).nullable(),
    archived: z.boolean(),
  })
  .partial()
  .strict();

/** Members can rename (channels only), set topic, archive. */
export const PATCH = route<P>(async (req, { conversationId }) => {
  const { sb } = await requireUser(req);
  const { archived, ...rest } = await body(req, Patch);
  const patch = { ...rest, ...(archived === undefined ? {} : { archived_at: archived ? new Date().toISOString() : null }) };
  return ok(db(await sb.from('conversations').update(patch).eq('id', conversationId).select().single()));
});
