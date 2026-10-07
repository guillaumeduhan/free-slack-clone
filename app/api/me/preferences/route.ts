import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body, query, db, uuid } from '@/lib/http';

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
  const { sb, uid } = await requireUser(req);
  const { workspace_id } = query(req, Q);
  await requireRole(sb, workspace_id, uid);
  const { data } = await sb.from('user_preferences').select('*').eq('user_id', uid).eq('workspace_id', workspace_id).maybeSingle();
  return ok(data ?? { user_id: uid, workspace_id, ...DEFAULTS });
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

export const PUT = route(async (req) => {
  const { sb, uid } = await requireUser(req);
  const { workspace_id } = query(req, Q);
  const prefs = await body(req, Put);
  return ok(
    db(
      await sb
        .from('user_preferences')
        .upsert({ user_id: uid, workspace_id, ...prefs }, { onConflict: 'user_id,workspace_id' })
        .select()
        .single(),
    ),
  );
});
