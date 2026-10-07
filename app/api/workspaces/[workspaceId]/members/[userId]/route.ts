import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, check } from '@/lib/http';

type P = { workspaceId: string; userId: string };

const Patch = z.object({ role: z.enum(['admin', 'member']) });

/** Owner/admin: change a member's role. Use /transfer-ownership for owner. */
export const PATCH = route<P>(async (req, { workspaceId, userId }) => {
  const { sb } = await requireUser(req);
  const { role } = await body(req, Patch);
  check(await sb.rpc('set_member_role', { p_ws: workspaceId, p_user: userId, p_role: role }));
  return ok({ user_id: userId, role });
});

/** Owner/admin removes someone, or a member leaves (userId = me). The owner cannot be removed. */
export const DELETE = route<P>(async (req, { workspaceId, userId }) => {
  const { sb, uid } = await requireUser(req);
  const target = userId === 'me' ? uid : userId;
  check(await sb.rpc('remove_member', { p_ws: workspaceId, p_user: target }));
  return ok({ removed: target });
});
