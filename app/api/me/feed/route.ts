import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, query, db, uuid } from '@/lib/http';

const Q = z.object({
  workspace_id: uuid,
  kind: z.enum(['mentions', 'threads', 'activity', 'saved', 'drafts']),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

type FeedRow = {
  item: string; message_id: number; parent_id: number | null; conversation_id: string;
  actor_id: string; body: string; emoji: string | null; created_at: string;
};

/** Sidebar views: Mentions, Threads, Activity, Saved, Drafts. */
export const GET = route(async (req) => {
  const { sb, uid } = await requireUser(req);
  const { workspace_id, kind, limit } = query(req, Q);
  await requireRole(sb, workspace_id, uid);

  if (kind === 'drafts') {
    return ok(
      db(
        await sb
          .from('drafts')
          .select('id, body, parent_id, updated_at, conversation:conversations!inner(id, kind, name, workspace_id)')
          .eq('user_id', uid)
          .eq('conversation.workspace_id', workspace_id)
          .order('updated_at', { ascending: false })
          .limit(limit),
      ),
    );
  }

  const rows = db(await sb.rpc('feed', { p_ws: workspace_id, p_kind: kind, p_limit: limit })) as FeedRow[];
  const userIds = [...new Set(rows.map((r) => r.actor_id))];
  const convIds = [...new Set(rows.map((r) => r.conversation_id))];
  const [users, convs] = await Promise.all([
    userIds.length ? sb.from('users').select('id, display_name, avatar_url, is_bot').in('id', userIds) : { data: [], error: null },
    convIds.length ? sb.from('conversations').select('id, kind, name').in('id', convIds) : { data: [], error: null },
  ]);
  const u = new Map(db(users).map((x) => [x.id, x]));
  const c = new Map(db(convs).map((x) => [x.id, x]));
  return ok(
    rows.map(({ actor_id, conversation_id, ...r }) => ({
      ...r,
      actor: u.get(actor_id) ?? null,
      conversation: c.get(conversation_id) ?? null,
    })),
  );
});
