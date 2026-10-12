import { requireUser } from '@/lib/auth';
import { route, ok } from '@/lib/http';

type P = { appId: string };

/** Owner/admin: revoke the current token and issue a new one (returned once). */
export const POST = route<P>(async (req, { appId }) => {
  const { db } = await requireUser(req);
  const row = await db((tx) => tx.maybe<{ token: string }>('select rotate_app_token($1) as token', [appId]));
  return ok({ token: row!.token, note: 'Store this token now. Only its hash is kept.' }, 201);
});
