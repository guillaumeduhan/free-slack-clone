import { z } from 'zod';
import { requireUser, requireRole, ADMIN } from '@/lib/auth';
import { route, ok, body, found } from '@/lib/http';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  return ok(
    await db(async (tx) => {
      const role = await requireRole(tx, workspaceId, uid);
      const ws = found(await tx.maybe('select * from workspaces where id = $1', [workspaceId]));
      return { ...ws, role };
    }),
  );
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
  const { uid, db } = await requireUser(req);
  const patch = await body(req, Patch);
  return ok(
    await db(async (tx) => {
      await requireRole(tx, workspaceId, uid, ADMIN);
      return found(
        await tx.maybe(
          `update workspaces set name = coalesce($2, name), slug = coalesce($3, slug),
                  description = case when $4::boolean then $5 else description end,
                  logo_url = case when $6::boolean then $7 else logo_url end
            where id = $1 returning *`,
          [workspaceId, patch.name ?? null, patch.slug ?? null,
           'description' in patch, patch.description ?? null, 'logo_url' in patch, patch.logo_url ?? null],
        ),
      );
    }),
  );
});

/** Owner only. Cascades to everything in the workspace. */
export const DELETE = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  await db(async (tx) => {
    await requireRole(tx, workspaceId, uid, ['owner']);
    found(await tx.maybe('delete from workspaces where id = $1 returning id', [workspaceId]));
  });
  return ok({ deleted: true });
});
