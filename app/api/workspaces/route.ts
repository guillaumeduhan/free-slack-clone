import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body } from '@/lib/http';

/** Workspaces I belong to, with my role. */
export const GET = route(async (req) => {
  const { uid, db } = await requireUser(req);
  return ok(
    await db((tx) =>
      tx.many(
        `select w.*, wm.role from workspace_members wm join workspaces w on w.id = wm.workspace_id
          where wm.user_id = $1 and wm.deactivated_at is null order by w.name`,
        [uid],
      ),
    ),
  );
});

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
});

/** Creates a workspace; the caller becomes owner and joins #general. */
export const POST = route(async (req) => {
  const { db } = await requireUser(req);
  const { name, slug } = await body(req, Create);
  return ok(await db((tx) => tx.maybe('select * from create_workspace($1, $2)', [name, slug])), 201);
});
