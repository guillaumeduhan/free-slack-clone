import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, query, db, check } from '@/lib/http';

type P = { conversationId: string };

const Put = z.object({
  body: z.string().max(40_000),
  parent_id: z.number().int().positive().nullable().default(null),
});

/** Save the composer's text (per conversation, or per thread with parent_id). Empty body deletes it. */
export const PUT = route<P>(async (req, { conversationId }) => {
  const { sb, uid } = await requireUser(req);
  const b = await body(req, Put);
  if (!b.body.trim()) {
    let d = sb.from('drafts').delete().eq('user_id', uid).eq('conversation_id', conversationId);
    d = b.parent_id ? d.eq('parent_id', b.parent_id) : d.is('parent_id', null);
    check(await d);
    return ok({ deleted: true });
  }
  return ok(
    db(
      await sb
        .from('drafts')
        .upsert(
          { user_id: uid, conversation_id: conversationId, parent_id: b.parent_id, body: b.body },
          { onConflict: 'user_id,conversation_id,parent_id' },
        )
        .select()
        .single(),
    ),
  );
});

export const DELETE = route<P>(async (req, { conversationId }) => {
  const { sb, uid } = await requireUser(req);
  const { parent_id } = query(req, z.object({ parent_id: z.coerce.number().int().positive().optional() }));
  let d = sb.from('drafts').delete().eq('user_id', uid).eq('conversation_id', conversationId);
  d = parent_id ? d.eq('parent_id', parent_id) : d.is('parent_id', null);
  check(await d);
  return ok({ deleted: true });
});
