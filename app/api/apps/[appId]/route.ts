import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, db, check, uuid } from '@/lib/http';
import { adminClient } from '@/lib/supabase';

type P = { appId: string };

/** App detail. Token/webhook metadata is only visible to owners/admins (RLS). */
export const GET = route<P>(async (req, { appId }) => {
  const { sb } = await requireUser(req);
  return ok(
    db(
      await sb
        .from('apps')
        .select(
          `*, bot:users!apps_bot_user_id_fkey(id, display_name, avatar_url),
           default_conversation:conversations(id, name),
           tokens:app_tokens(id, token_prefix, scopes, last_used_at, revoked_at, created_at),
           webhooks(id, conversation_id, created_at, disabled_at)`,
        )
        .eq('id', appId)
        .single(),
    ),
  );
});

const Patch = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500).nullable(),
    default_conversation_id: uuid.nullable(),
  })
  .partial()
  .strict();

/** Owner/admin. Renaming also renames the bot user so past messages show the new name. */
export const PATCH = route<P>(async (req, { appId }) => {
  const { sb } = await requireUser(req);
  const patch = await body(req, Patch);
  const app = db(await sb.from('apps').update(patch).eq('id', appId).select().single());
  if (patch.name) check(await adminClient().from('users').update({ display_name: patch.name }).eq('id', app.bot_user_id));
  return ok(app);
});

/** Owner/admin. Revokes tokens and webhooks; the app's past messages stay. */
export const DELETE = route<P>(async (req, { appId }) => {
  const { sb } = await requireUser(req);
  check(await sb.rpc('delete_app', { p_app: appId }));
  return ok({ deleted: appId });
});
