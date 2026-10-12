import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, uuid } from '@/lib/http';

type P = { workspaceId: string };

/** Owner only. The new owner is promoted, the old owner becomes admin. */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { db } = await requireUser(req);
  const { user_id } = await body(req, z.object({ user_id: uuid }));
  await db((tx) => tx.exec('select transfer_ownership($1, $2)', [workspaceId, user_id]));
  return ok({ owner: user_id });
});
