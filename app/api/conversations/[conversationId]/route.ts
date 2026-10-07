import { z } from 'zod';
import { requireUser, requireConversation } from '@/lib/auth';
import { route, ok, body, found } from '@/lib/http';

type P = { conversationId: string };

export const GET = route<P>(async (req, { conversationId }) => {
  const { uid, db } = await requireUser(req);
  return ok(
    await db(async (tx) => {
      const conv = await requireConversation(tx, conversationId);
      const counts = await tx.maybe<{ member_count: number }>(
        'select count(*) as member_count from conversation_members where conversation_id = $1',
        [conversationId],
      );
      const membership = await tx.maybe(
        `select last_read_message_id, muted, starred, notify_level from conversation_members
          where conversation_id = $1 and user_id = $2`,
        [conversationId, uid],
      );
      return { ...conv, member_count: counts?.member_count ?? 0, membership };
    }),
  );
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
  const { db } = await requireUser(req);
  const p = await body(req, Patch);
  return ok(
    await db(async (tx) =>
      found(
        await tx.maybe(
          `update conversations set
                  name = coalesce($2, name),
                  topic = case when $3::boolean then $4 else topic end,
                  description = case when $5::boolean then $6 else description end,
                  archived_at = case when $7::boolean is null then archived_at when $7 then now() else null end
            where id = $1 returning *`,
          [conversationId, p.name ?? null, 'topic' in p, p.topic ?? null,
           'description' in p, p.description ?? null, p.archived ?? null],
        ),
        'Conversation not found',
      ),
    ),
  );
});

/** Owner/admin: delete a channel and everything in it (#general can't be deleted). */
export const DELETE = route<P>(async (req, { conversationId }) => {
  const { db } = await requireUser(req);
  await db((tx) => tx.exec('select delete_channel($1)', [conversationId]));
  return ok({ deleted: conversationId });
});
