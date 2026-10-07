import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, db } from '@/lib/http';

/** Accept an invite link. The signed-in email must match the invitation. */
export const POST = route(async (req) => {
  const { sb } = await requireUser(req);
  const { token } = await body(req, z.object({ token: z.string().min(16).max(200) }));
  const workspaceId = db(await sb.rpc('accept_invitation', { p_token: token }));
  return ok({ workspace_id: workspaceId });
});
