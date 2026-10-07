import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body, query } from '@/lib/http';

type P = { workspaceId: string };

const Q = z.object({ browse: z.enum(['1', 'true']).optional() });

/**
 * Default: my sidebar (channels + DMs I'm in, with unread counts).
 * ?browse=1: every public channel, for "Browse channels".
 */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  const browse = query(req, Q).browse;
  return ok(
    await db(async (tx) => {
      await requireRole(tx, workspaceId, uid);
      if (browse) {
        return tx.many(
          `select c.id, c.name, c.topic, c.created_at,
                  (select count(*) from conversation_members cm where cm.conversation_id = c.id) as member_count,
                  exists (select 1 from conversation_members cm where cm.conversation_id = c.id and cm.user_id = $2) as joined
             from conversations c
            where c.workspace_id = $1 and c.kind = 'public_channel' and c.archived_at is null
            order by c.name`,
          [workspaceId, uid],
        );
      }
      const rows = await tx.many<{ kind: string }>('select * from sidebar($1)', [workspaceId]);
      return {
        channels: rows.filter((r) => r.kind === 'public_channel' || r.kind === 'private_channel'),
        direct_messages: rows.filter((r) => r.kind === 'dm' || r.kind === 'group_dm'),
      };
    }),
  );
});

const Create = z.object({
  name: z.string().trim().toLowerCase().transform((s) => s.replace(/\s+/g, '-')).pipe(z.string().regex(/^[a-z0-9_-]{1,80}$/)),
  private: z.boolean().default(false),
  topic: z.string().max(250).nullable().default(null),
});

/** Create a channel (names are lowercase-with-hyphens, unique per workspace). */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { db } = await requireUser(req);
  const b = await body(req, Create);
  return ok(
    await db((tx) => tx.maybe('select * from create_channel($1, $2, $3, $4)', [workspaceId, b.name, b.private, b.topic])),
    201,
  );
});
