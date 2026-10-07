import { requireUser } from '@/lib/auth';
import { route, ok, db } from '@/lib/http';

type P = { invitationId: string };

/** Owner/admin: revoke a pending invitation (RLS checks the role). */
export const DELETE = route<P>(async (req, { invitationId }) => {
  const { sb } = await requireUser(req);
  db(
    await sb
      .from('invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId)
      .eq('status', 'pending')
      .select('id')
      .single(),
  );
  return ok({ revoked: invitationId });
});
