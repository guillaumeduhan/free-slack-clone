import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, query, uuid } from '@/lib/http';

const Q = z.object({
  workspace_id: uuid,
  kind: z.enum(['mentions', 'threads', 'activity', 'saved', 'drafts']),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Sidebar views: Mentions, Threads, Activity, Saved, Drafts. */
export const GET = route(async (req) => {
  const { uid, db } = await requireUser(req);
  const { workspace_id, kind, limit } = query(req, Q);
  return ok(
    await db(async (tx) => {
      await requireRole(tx, workspace_id, uid);
      if (kind === 'drafts') {
        return tx.many(
          `select d.id, d.body, d.parent_id, d.updated_at,
                  json_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'workspace_id', c.workspace_id) as conversation
             from drafts d join conversations c on c.id = d.conversation_id
            where d.user_id = $1 and c.workspace_id = $2
            order by d.updated_at desc limit $3`,
          [uid, workspace_id, limit],
        );
      }
      return tx.many(
        `select f.item, f.message_id, f.parent_id, f.body, f.emoji, f.created_at,
                (select json_build_object('id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url, 'is_bot', u.is_bot)
                   from users u where u.id = f.actor_id) as actor,
                (select json_build_object('id', c.id, 'kind', c.kind, 'name', c.name)
                   from conversations c where c.id = f.conversation_id) as conversation
           from feed($1, $2, $3) f`,
        [workspace_id, kind, limit],
      );
    }),
  );
});
