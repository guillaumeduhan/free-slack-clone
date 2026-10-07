import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, found } from '@/lib/http';

/** My profile and the workspaces I belong to. */
export const GET = route(async (req) => {
  const { uid, db } = await requireUser(req);
  return ok(
    await db(async (tx) => {
      const me = found(await tx.maybe('select * from users where id = $1', [uid]));
      const workspaces = await tx.many(
        `select wm.role, json_build_object('id', w.id, 'name', w.name, 'slug', w.slug, 'logo_url', w.logo_url) as workspace
           from workspace_members wm join workspaces w on w.id = wm.workspace_id
          where wm.user_id = $1 and wm.deactivated_at is null order by w.name`,
        [uid],
      );
      return { ...me, workspaces };
    }),
  );
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

const NULLABLE = ['title', 'avatar_url', 'status_text', 'status_emoji'] as const;

export const PATCH = route(async (req) => {
  const { uid, db } = await requireUser(req);
  const patch = await body(req, Patch);
  const sets: string[] = [];
  const params: unknown[] = [uid];
  for (const key of ['display_name', 'timezone', ...NULLABLE] as const) {
    if (!(key in patch)) continue;
    params.push(patch[key] ?? null);
    sets.push(`${key} = $${params.length}`);
  }
  return ok(
    await db(async (tx) =>
      sets.length
        ? found(await tx.maybe(`update users set ${sets.join(', ')} where id = $1 returning *`, params))
        : found(await tx.maybe('select * from users where id = $1', [uid])),
    ),
  );
});
