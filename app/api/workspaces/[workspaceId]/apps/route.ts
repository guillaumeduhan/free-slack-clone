import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body, db, uuid } from '@/lib/http';

type P = { workspaceId: string };

const APP_SELECT =
  'id, kind, name, description, created_at, bot:users!apps_bot_user_id_fkey(id, display_name, avatar_url), default_conversation:conversations(id, name)';

/** Apps, agents & bots installed in the workspace. */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid);
  return ok(db(await sb.from('apps').select(APP_SELECT).eq('workspace_id', workspaceId).order('name')));
});

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['app', 'agent', 'bot']).default('app'),
  description: z.string().max(500).nullable().default(null),
  default_conversation_id: uuid.nullable().default(null),
});

/**
 * Owner/admin: create an app with its bot user, an xoxb- token and,
 * if a default channel is given, an incoming webhook. Secrets are returned once.
 */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { sb } = await requireUser(req);
  const b = await body(req, Create);
  const res = db(
    await sb.rpc('create_app', {
      p_ws: workspaceId,
      p_name: b.name,
      p_kind: b.kind,
      p_description: b.description,
      p_default_conv: b.default_conversation_id,
    }),
  ) as { app: unknown; token: string; webhook_secret: string | null };
  const origin = new URL(req.url).origin;
  return ok(
    {
      app: res.app,
      token: res.token,
      webhook_url: res.webhook_secret ? `${origin}/api/hooks/${res.webhook_secret}` : null,
      note: 'Store the token and webhook URL now. Only their hashes are kept.',
    },
    201,
  );
});
