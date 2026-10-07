import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, query, db } from '@/lib/http';
import { MESSAGE_SELECT, serializeMessages } from '@/lib/messages';

type P = { workspaceId: string };

const Q = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Global search: people, channels and messages (full-text). */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid);
  const { q, limit } = query(req, Q);
  const safe = q.replace(/[,()"\\%_]/g, ' ').trim();
  const like = `%${safe}%`;

  const [people, channels, messages] = await Promise.all([
    sb
      .from('users')
      .select('id, display_name, title, avatar_url, is_bot, workspace_members!inner(workspace_id, deactivated_at)')
      .eq('workspace_members.workspace_id', workspaceId)
      .is('workspace_members.deactivated_at', null)
      .or(`display_name.ilike."${like}",title.ilike."${like}",email.ilike."${like}"`)
      .limit(limit),
    sb
      .from('conversations')
      .select('id, kind, name, topic')
      .eq('workspace_id', workspaceId)
      .in('kind', ['public_channel', 'private_channel'])
      .is('archived_at', null)
      .ilike('name', like)
      .limit(limit),
    sb.rpc('search_messages', { p_ws: workspaceId, p_q: q, p_limit: limit }).select(MESSAGE_SELECT),
  ]);

  return ok({
    people: db(people).map(({ workspace_members, ...p }) => p),
    channels: db(channels),
    messages: await serializeMessages(db(messages), uid),
  });
});
