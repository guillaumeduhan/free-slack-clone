import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body } from '@/lib/http';

type P = { workspaceId: string; userId: string };

const Patch = z.object({ role: z.enum(['admin', 'member']) });

/** Owner/admin: change a member's role. Use /transfer-ownership for owner. */
export const PATCH = route<P>(async (req, { workspaceId, userId }) => {
  const { db } = await requireUser(req);
  const { role } = await body(req, Patch);
  await db((tx) => tx.exec('select set_member_role($1, $2, $3)', [workspaceId, userId, role]));
  return ok({ user_id: userId, role });
});

/** Owner/admin removes someone, or a member leaves (userId = me). The owner cannot be removed. */
export const DELETE = route<P>(async (req, { workspaceId, userId }) => {
  const { uid, db } = await requireUser(req);
  const target = userId === 'me' ? uid : userId;
  await db((tx) => tx.exec('select remove_member($1, $2)', [workspaceId, target]));
  return ok({ removed: target });
});
