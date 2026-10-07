import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body, query, db } from '@/lib/http';

type P = { workspaceId: string };

const Q = z.object({ browse: z.enum(['1', 'true']).optional() });

/**
 * Default: my sidebar (channels + DMs I'm in, with unread counts).
 * ?browse=1: every public channel, for "Browse channels".
 */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid);
  if (query(req, Q).browse) {
    return ok(
      db(
        await sb
          .from('conversations')
          .select('id, name, topic, created_at, members:conversation_members(count)')
          .eq('workspace_id', workspaceId)
          .eq('kind', 'public_channel')
          .is('archived_at', null)
          .order('name'),
      ),
    );
  }
  const rows = db(await sb.rpc('sidebar', { p_ws: workspaceId })) as { kind: string }[];
  return ok({
    channels: rows.filter((r) => r.kind === 'public_channel' || r.kind === 'private_channel'),
    direct_messages: rows.filter((r) => r.kind === 'dm' || r.kind === 'group_dm'),
  });
});

const Create = z.object({
  name: z.string().trim().toLowerCase().replace(/\s+/g, '-').pipe(z.string().regex(/^[a-z0-9_-]{1,80}$/)),
  private: z.boolean().default(false),
  topic: z.string().max(250).nullable().default(null),
});

/** Create a channel (names are lowercase-with-hyphens, unique per workspace). */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { sb } = await requireUser(req);
  const b = await body(req, Create);
  return ok(
    db(await sb.rpc('create_channel', { p_ws: workspaceId, p_name: b.name, p_private: b.private, p_topic: b.topic })),
    201,
  );
});
