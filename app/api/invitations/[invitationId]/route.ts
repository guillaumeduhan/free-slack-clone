import { requireUser } from '@/lib/auth';
import { route, ok, found } from '@/lib/http';

type P = { invitationId: string };

/** Owner/admin: revoke a pending invitation (RLS checks the role). */
export const DELETE = route<P>(async (req, { invitationId }) => {
  const { db } = await requireUser(req);
  await db(async (tx) =>
    found(
      await tx.maybe(
        `update invitations set status = 'revoked' where id = $1 and status = 'pending' returning id`,
        [invitationId],
      ),
      'Invitation not found',
    ),
  );
  return ok({ revoked: invitationId });
});
