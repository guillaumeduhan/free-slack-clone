import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, uuid } from '@/lib/http';

type P = { workspaceId: string };

/** Open (find or create) a DM or group DM with these people. */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { db } = await requireUser(req);
  const { user_ids } = await body(req, z.object({ user_ids: z.array(uuid).min(1).max(8) }));
  return ok(await db((tx) => tx.maybe('select * from open_dm($1, $2::uuid[])', [workspaceId, user_ids])));
});
