import { requireUser, requireRole } from '@/lib/auth';
import { route, ok } from '@/lib/http';

type P = { workspaceId: string };

/** Active members with role and profile (Members tab, member count). */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  const rows = await db(async (tx) => {
    await requireRole(tx, workspaceId, uid);
    return tx.many<{ role: string }>(
      `select wm.role, wm.joined_at,
              json_build_object('id', u.id, 'email', u.email, 'display_name', u.display_name, 'title', u.title,
                                'avatar_url', u.avatar_url, 'timezone', u.timezone, 'status_text', u.status_text,
                                'status_emoji', u.status_emoji, 'is_bot', u.is_bot, 'last_seen_at', u.last_seen_at) as user
         from workspace_members wm join users u on u.id = wm.user_id
        where wm.workspace_id = $1 and wm.deactivated_at is null
        order by wm.joined_at`,
      [workspaceId],
    );
  });
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.role]: (acc[r.role] ?? 0) + 1 }), {});
  return ok({ members: rows, counts });
});
