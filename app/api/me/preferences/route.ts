import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body, query, uuid } from '@/lib/http';

const Q = z.object({ workspace_id: uuid });

const DEFAULTS = {
  theme: 'dark',
  notify_level: 'mentions',
  desktop_enabled: true,
  sound_enabled: true,
  email_digest: false,
  dnd_enabled: false,
  dnd_start: null,
  dnd_end: null,
};

/** Theme, notifications, do not disturb: ?workspace_id=… */
export const GET = route(async (req) => {
  const { uid, db } = await requireUser(req);
  const { workspace_id } = query(req, Q);
  return ok(
    await db(async (tx) => {
      await requireRole(tx, workspace_id, uid);
      const row = await tx.maybe('select * from user_preferences where user_id = $1 and workspace_id = $2', [uid, workspace_id]);
      return row ?? { user_id: uid, workspace_id, ...DEFAULTS };
    }),
  );
});

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const Put = z
  .object({
    theme: z.enum(['dark', 'light']),
    notify_level: z.enum(['all', 'mentions', 'none']),
    desktop_enabled: z.boolean(),
    sound_enabled: z.boolean(),
    email_digest: z.boolean(),
    dnd_enabled: z.boolean(),
    dnd_start: time.nullable(),
    dnd_end: time.nullable(),
  })
  .partial()
  .strict();

const COLUMNS = Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[];

export const PUT = route(async (req) => {
  const { uid, db } = await requireUser(req);
  const { workspace_id } = query(req, Q);
  const prefs = await body(req, Put);
  const keys = COLUMNS.filter((k) => k in prefs);
  const values = keys.map((k) => prefs[k] ?? null);
  const cols = ['user_id', 'workspace_id', ...keys];
  const sql = `insert into user_preferences (${cols.join(', ')})
               values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
               on conflict (user_id, workspace_id) do update set
                 ${keys.length ? keys.map((k) => `${k} = excluded.${k}`).join(', ') : 'theme = user_preferences.theme'}
               returning *`;
  return ok(await db((tx) => tx.maybe(sql, [uid, workspace_id, ...values])));
});
