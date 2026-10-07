import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, check } from '@/lib/http';

type P = { conversationId: string };

/** Move my read marker forward (clears the unread badge and "New" divider). */
export const POST = route<P>(async (req, { conversationId }) => {
  const { sb } = await requireUser(req);
  const { message_id } = await body(req, z.object({ message_id: z.number().int().positive() }));
  check(await sb.rpc('mark_read', { p_conv: conversationId, p_message: message_id }));
  return ok({ last_read_message_id: message_id });
});
