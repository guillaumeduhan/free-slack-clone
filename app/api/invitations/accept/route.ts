import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body } from '@/lib/http';

/** Accept an invite link. The signed-in email must match the invitation. */
export const POST = route(async (req) => {
  const { db } = await requireUser(req);
  const { token } = await body(req, z.object({ token: z.string().min(16).max(200) }));
  const row = await db((tx) => tx.maybe<{ id: string }>('select accept_invitation($1) as id', [token]));
  return ok({ workspace_id: row!.id });
});
