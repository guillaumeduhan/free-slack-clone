import { requireUser } from '@/lib/auth';
import { route, ok, db } from '@/lib/http';

type P = { appId: string };

/** Owner/admin: revoke the current token and issue a new one (returned once). */
export const POST = route<P>(async (req, { appId }) => {
  const { sb } = await requireUser(req);
  const token = db(await sb.rpc('rotate_app_token', { p_app: appId }));
  return ok({ token, note: 'Store this token now. Only its hash is kept.' }, 201);
});
