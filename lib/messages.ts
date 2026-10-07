import type { Tx } from './db';

/**
 * One JSON object per message `m`: columns, author, reactions and files.
 * Runs under RLS, so embeds only include rows the caller can read.
 */
export const MESSAGE_JSON = `json_build_object(
  'id', m.id, 'conversation_id', m.conversation_id, 'parent_id', m.parent_id, 'user_id', m.user_id, 'body', m.body,
  'reply_count', m.reply_count, 'last_reply_at', m.last_reply_at, 'also_sent_to_channel', m.also_sent_to_channel,
  'edited_at', m.edited_at, 'deleted_at', m.deleted_at, 'created_at', m.created_at,
  'author', (select json_build_object('id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url, 'is_bot', u.is_bot)
               from users u where u.id = m.user_id),
  'saved', exists (select 1 from saved_items s where s.message_id = m.id and s.user_id = chat.uid()),
  'reply_users', (select coalesce(json_agg(x.user_id), '[]') from (
                    select r.user_id from messages r where r.parent_id = m.id and r.deleted_at is null
                     group by r.user_id order by max(r.id) desc limit 5) x),
  'reactions', (select coalesce(json_agg(json_build_object('emoji', x.emoji, 'user_id', x.user_id) order by x.created_at), '[]')
                  from reactions x where x.message_id = m.id),
  'files', (select coalesce(json_agg(json_build_object(
                     'id', f.id, 'name', f.name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
                     'width', f.width, 'height', f.height, 'duration_ms', f.duration_ms) order by mf.position), '[]')
              from message_files mf join files f on f.id = mf.file_id where mf.message_id = m.id)
)`;

type ReactionRow = { emoji: string; user_id: string };
type FileRow = { id: string; [k: string]: unknown };
export type MessageRow = { id: number; reactions: ReactionRow[]; files: FileRow[]; [k: string]: unknown };

export function summarizeReactions(rows: ReactionRow[], uid: string) {
  const groups = new Map<string, { emoji: string; count: number; mine: boolean; user_ids: string[] }>();
  for (const r of rows) {
    const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, user_ids: [] };
    g.count += 1;
    g.mine ||= r.user_id === uid;
    g.user_ids.push(r.user_id);
    groups.set(r.emoji, g);
  }
  return [...groups.values()];
}

/** Groups reactions and adds a download URL to each file (served by /api/files/:id/content). */
export function serializeMessage(row: MessageRow, uid: string) {
  return {
    ...row,
    reactions: summarizeReactions(row.reactions, uid),
    files: row.files.map((f) => ({ ...f, url: `/api/files/${f.id}/content` })),
  };
}

/** Messages matching `where` (on alias m), serialized, in the given order. */
export async function selectMessages(tx: Tx, uid: string, where: string, params: unknown[], tail = 'order by m.id') {
  const rows = await tx.many<{ j: MessageRow }>(`select ${MESSAGE_JSON} as j from messages m where ${where} ${tail}`, params);
  return rows.map((r) => serializeMessage(r.j, uid));
}

export async function selectMessage(tx: Tx, uid: string, id: number) {
  return (await selectMessages(tx, uid, 'm.id = $1', [id]))[0] ?? null;
}
