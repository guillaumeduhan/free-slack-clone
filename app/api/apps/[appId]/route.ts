import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route, ok, body, found, uuid } from '@/lib/http';
import { asServer } from '@/lib/db';

type P = { appId: string };

/** App detail. Token/webhook metadata is only visible to owners/admins (RLS). */
export const GET = route<P>(async (req, { appId }) => {
  const { db } = await requireUser(req);
  return ok(
    found(
      await db((tx) =>
        tx.maybe(
          `select a.*,
                  json_build_object('id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url) as bot,
                  case when c.id is null then null else json_build_object('id', c.id, 'name', c.name) end as default_conversation,
                  (select coalesce(json_agg(json_build_object('id', t.id, 'token_prefix', t.token_prefix, 'scopes', t.scopes,
                            'last_used_at', t.last_used_at, 'revoked_at', t.revoked_at, 'created_at', t.created_at)
                            order by t.created_at desc), '[]')
                     from app_tokens t where t.app_id = a.id) as tokens,
                  (select coalesce(json_agg(json_build_object('id', w.id, 'conversation_id', w.conversation_id,
                            'created_at', w.created_at, 'disabled_at', w.disabled_at)), '[]')
                     from webhooks w where w.app_id = a.id) as webhooks,
                  (select coalesce(json_agg(r order by r.id desc), '[]') from (
                     select m.id, m.body, m.created_at, m.conversation_id, c.name as conversation_name
                       from messages m join conversations c on c.id = m.conversation_id
                      where m.user_id = a.bot_user_id and m.deleted_at is null
                      order by m.id desc limit 6) r) as recent
             from apps a
             join users u on u.id = a.bot_user_id
             left join conversations c on c.id = a.default_conversation_id
            where a.id = $1`,
          [appId],
        ),
      ),
      'App not found',
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
  const { db } = await requireUser(req);
  const p = await body(req, Patch);
  const app = await db(async (tx) =>
    found(
      await tx.maybe<{ bot_user_id: string }>(
        `update apps set name = coalesce($2, name),
                description = case when $3::boolean then $4 else description end,
                default_conversation_id = case when $5::boolean then $6::uuid else default_conversation_id end
          where id = $1 returning *`,
        [appId, p.name ?? null, 'description' in p, p.description ?? null,
         'default_conversation_id' in p, p.default_conversation_id ?? null],
      ),
      'App not found',
    ),
  );
  // Bot users can't be edited by people (RLS), so the rename goes through the server role.
  if (p.name) await asServer((tx) => tx.exec('update users set display_name = $2 where id = $1 and is_bot', [app.bot_user_id, p.name]));
  return ok(app);
});

/** Owner/admin. Revokes tokens and webhooks; the app's past messages stay. */
export const DELETE = route<P>(async (req, { appId }) => {
  const { db } = await requireUser(req);
  await db((tx) => tx.exec('select delete_app($1)', [appId]));
  return ok({ deleted: appId });
});
