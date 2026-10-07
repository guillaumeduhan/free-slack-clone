import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, db, uuid } from '@/lib/http';

type P = { workspaceId: string };

/** Open (find or create) a DM or group DM with these people. */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { sb } = await requireUser(req);
  const { user_ids } = await body(req, z.object({ user_ids: z.array(uuid).min(1).max(8) }));
  return ok(db(await sb.rpc('open_dm', { p_ws: workspaceId, p_users: user_ids })));
});
