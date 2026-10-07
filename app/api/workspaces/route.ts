import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, db } from '@/lib/http';

/** Workspaces I belong to, with my role. */
export const GET = route(async (req) => {
  const { sb, uid } = await requireUser(req);
  const rows = db(
    await sb.from('workspace_members').select('role, workspace:workspaces(*)').eq('user_id', uid).is('deactivated_at', null),
  );
  return ok(rows.map((r) => ({ ...(r.workspace as object), role: r.role })));
});

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
});

/** Creates a workspace; the caller becomes owner and joins #general. */
export const POST = route(async (req) => {
  const { sb } = await requireUser(req);
  const { name, slug } = await body(req, Create);
  return ok(db(await sb.rpc('create_workspace', { p_name: name, p_slug: slug })), 201);
});
