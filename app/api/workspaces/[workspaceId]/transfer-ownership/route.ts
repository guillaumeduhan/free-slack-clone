import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, check, uuid } from '@/lib/http';

type P = { workspaceId: string };

/** Owner only. The new owner is promoted, the old owner becomes admin. */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { sb } = await requireUser(req);
  const { user_id } = await body(req, z.object({ user_id: uuid }));
  check(await sb.rpc('transfer_ownership', { p_ws: workspaceId, p_user: user_id }));
  return ok({ owner: user_id });
});
