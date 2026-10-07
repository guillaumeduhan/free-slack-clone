import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, db } from '@/lib/http';

type P = { workspaceId: string };

/** Active members with role and profile (Members tab, member count). */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid);
  const rows = db(
    await sb
      .from('workspace_members')
      .select('role, joined_at, user:users(id, email, display_name, title, avatar_url, timezone, status_text, status_emoji, is_bot, last_seen_at)')
      .eq('workspace_id', workspaceId)
      .is('deactivated_at', null)
      .order('joined_at'),
  );
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.role]: (acc[r.role] ?? 0) + 1 }), {} as Record<string, number>);
  return ok({ members: rows, counts });
});
