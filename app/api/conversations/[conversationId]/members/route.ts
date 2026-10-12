import { z } from 'zod';
import { requireUser, requireConversation } from '@/lib/auth';
import { route, ok, body, query, found, uuid } from '@/lib/http';

type P = { conversationId: string };

/** People in the conversation ("14 members" dialog). */
export const GET = route<P>(async (req, { conversationId }) => {
  const { db } = await requireUser(req);
  return ok(
    await db(async (tx) => {
      await requireConversation(tx, conversationId);
      return tx.many(
        `select cm.joined_at,
                json_build_object('id', u.id, 'display_name', u.display_name, 'title', u.title, 'avatar_url', u.avatar_url,
                                  'is_bot', u.is_bot, 'status_emoji', u.status_emoji, 'last_seen_at', u.last_seen_at) as user
           from conversation_members cm join users u on u.id = cm.user_id
          where cm.conversation_id = $1
          order by cm.joined_at`,
        [conversationId],
      );
    }),
  );
});

/** Add people to a channel (caller must be in it). Send [] with join=true to join a public channel. */
export const POST = route<P>(async (req, { conversationId }) => {
  const { uid, db } = await requireUser(req);
  const b = await body(req, z.object({ user_ids: z.array(uuid).max(100).default([]), join: z.boolean().default(false) }));
  if (b.join) {
    await db((tx) =>
      tx.exec('insert into conversation_members (conversation_id, user_id) values ($1, $2) on conflict do nothing', [conversationId, uid]),
    );
    return ok({ joined: true });
  }
  const row = await db((tx) => tx.maybe<{ n: number }>('select add_conversation_members($1, $2::uuid[]) as n', [conversationId, b.user_ids]));
  return ok({ added: row?.n ?? 0 });
});

/** Leave (no user_id) or, for admins, remove someone: ?user_id=… */
export const DELETE = route<P>(async (req, { conversationId }) => {
  const { uid, db } = await requireUser(req);
  const { user_id } = query(req, z.object({ user_id: uuid.optional() }));
  const target = user_id ?? uid;
  await db(async (tx) =>
    found(
      await tx.maybe('delete from conversation_members where conversation_id = $1 and user_id = $2 returning user_id', [conversationId, target]),
      'Member not found',
    ),
  );
  return ok({ removed: target });
});
