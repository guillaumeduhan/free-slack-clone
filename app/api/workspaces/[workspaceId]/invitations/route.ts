import { z } from 'zod';
import { requireUser, requireRole, ADMIN } from '@/lib/auth';
import { route, ok, body } from '@/lib/http';

type P = { workspaceId: string };

/** Owner/admin: pending invitations. */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  return ok(
    await db(async (tx) => {
      await requireRole(tx, workspaceId, uid, ADMIN);
      return tx.many(
        `select id, email, role, status, invited_by, created_at, expires_at from invitations
          where workspace_id = $1 and status = 'pending' order by created_at desc`,
        [workspaceId],
      );
    }),
  );
});

const Create = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(['admin', 'member']).default('member') });

/** Owner/admin: invite by email. The link is returned once; send it by email. */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { db } = await requireUser(req);
  const { email, role } = await body(req, Create);
  const res = await db((tx) =>
    tx.maybe<{ r: { invitation: unknown; token: string } }>('select create_invitation($1, $2, $3) as r', [workspaceId, email, role]),
  );
  const link = new URL(`/invite/${res!.r.token}`, req.url).toString();
  return ok({ invitation: res!.r.invitation, invite_url: link }, 201);
});
