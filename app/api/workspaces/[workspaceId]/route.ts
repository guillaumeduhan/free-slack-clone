import { z } from 'zod';
import { requireUser, requireRole, ADMIN } from '@/lib/auth';
import { route, ok, body, db } from '@/lib/http';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  const role = await requireRole(sb, workspaceId, uid);
  const ws = db(await sb.from('workspaces').select('*').eq('id', workspaceId).single());
  return ok({ ...ws, role });
});

const Patch = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
    description: z.string().max(500).nullable(),
    logo_url: z.string().url().nullable(),
  })
  .partial()
  .strict();

/** Owner/admin: rename, change URL, description, logo. */
export const PATCH = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid, ADMIN);
  const patch = await body(req, Patch);
  return ok(db(await sb.from('workspaces').update(patch).eq('id', workspaceId).select().single()));
});

/** Owner only. Cascades to everything in the workspace. */
export const DELETE = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid, ['owner']);
  db(await sb.from('workspaces').delete().eq('id', workspaceId).select('id').single());
  return ok({ deleted: true });
});
