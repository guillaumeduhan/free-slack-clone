import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body, uuid } from '@/lib/http';

type P = { workspaceId: string };

/** Apps, agents & bots installed in the workspace. */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  return ok(
    await db(async (tx) => {
      await requireRole(tx, workspaceId, uid);
      return tx.many(
        `select a.id, a.kind, a.name, a.description, a.created_at,
                json_build_object('id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url) as bot,
                case when c.id is null then null else json_build_object('id', c.id, 'name', c.name) end as default_conversation
           from apps a
           join users u on u.id = a.bot_user_id
           left join conversations c on c.id = a.default_conversation_id
          where a.workspace_id = $1
          order by a.name`,
        [workspaceId],
      );
    }),
  );
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
  const { db } = await requireUser(req);
  const b = await body(req, Create);
  const row = await db((tx) =>
    tx.maybe<{ r: { app: unknown; token: string; webhook_secret: string | null } }>(
      'select create_app($1, $2, $3, $4, $5) as r',
      [workspaceId, b.name, b.kind, b.description, b.default_conversation_id],
    ),
  );
  const res = row!.r;
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
