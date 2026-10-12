import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, query } from '@/lib/http';
import { selectMessages } from '@/lib/messages';

type P = { workspaceId: string };

const Q = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Global search: people, channels and messages (full-text). */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  const { q, limit } = query(req, Q);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  return ok(
    await db(async (tx) => {
      await requireRole(tx, workspaceId, uid);
      const people = await tx.many(
        `select u.id, u.display_name, u.title, u.avatar_url, u.is_bot
           from users u join workspace_members wm on wm.user_id = u.id
          where wm.workspace_id = $1 and wm.deactivated_at is null
            and (u.display_name ilike $2 or u.title ilike $2 or u.email ilike $2)
          order by u.display_name limit $3`,
        [workspaceId, like, limit],
      );
      const channels = await tx.many(
        `select id, kind, name, topic from conversations
          where workspace_id = $1 and kind in ('public_channel', 'private_channel') and archived_at is null
            and name ilike $2
          order by name limit $3`,
        [workspaceId, like, limit],
      );
      const messages = await selectMessages(
        tx, uid, 'm.id in (select id from search_messages($1, $2, $3))', [workspaceId, q, limit], 'order by m.created_at desc',
      );
      return { people, channels, messages };
    }),
  );
});
