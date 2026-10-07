import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, query } from '@/lib/http';

type P = { conversationId: string };

const Put = z.object({
  body: z.string().max(40_000),
  parent_id: z.number().int().positive().nullable().default(null),
});

const DELETE_SQL = 'delete from drafts where user_id = $1 and conversation_id = $2 and parent_id is not distinct from $3';

/** Save the composer's text (per conversation, or per thread with parent_id). Empty body deletes it. */
export const PUT = route<P>(async (req, { conversationId }) => {
  const { uid, db } = await requireUser(req);
  const b = await body(req, Put);
  if (!b.body.trim()) {
    await db((tx) => tx.exec(DELETE_SQL, [uid, conversationId, b.parent_id]));
    return ok({ deleted: true });
  }
  return ok(
    await db((tx) =>
      tx.maybe(
        `insert into drafts (user_id, conversation_id, parent_id, body) values ($1, $2, $3, $4)
         on conflict (user_id, conversation_id, parent_id) do update set body = excluded.body
         returning *`,
        [uid, conversationId, b.parent_id, b.body],
      ),
    ),
  );
});

export const DELETE = route<P>(async (req, { conversationId }) => {
  const { uid, db } = await requireUser(req);
  const { parent_id } = query(req, z.object({ parent_id: z.coerce.number().int().positive().optional() }));
  await db((tx) => tx.exec(DELETE_SQL, [uid, conversationId, parent_id ?? null]));
  return ok({ deleted: true });
});
