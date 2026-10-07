import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, db } from '@/lib/http';

/** My profile and the workspaces I belong to. */
export const GET = route(async (req) => {
  const { sb, uid } = await requireUser(req);
  const [me, memberships] = await Promise.all([
    sb.from('users').select('*').eq('id', uid).single(),
    sb.from('workspace_members').select('role, workspace:workspaces(id, name, slug, logo_url)').eq('user_id', uid).is('deactivated_at', null),
  ]);
  return ok({ ...db(me), workspaces: db(memberships) });
});

const Patch = z
  .object({
    display_name: z.string().trim().min(1).max(80),
    title: z.string().max(120).nullable(),
    avatar_url: z.string().url().nullable(),
    timezone: z.string().min(1).max(64),
    status_text: z.string().max(100).nullable(),
    status_emoji: z.string().max(16).nullable(),
  })
  .partial()
  .strict();

export const PATCH = route(async (req) => {
  const { sb, uid } = await requireUser(req);
  const patch = await body(req, Patch);
  return ok(db(await sb.from('users').update(patch).eq('id', uid).select().single()));
});
