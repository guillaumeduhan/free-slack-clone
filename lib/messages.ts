import { adminClient } from './supabase';

/** Columns + embeds returned for every message. */
export const MESSAGE_SELECT = `
  id, conversation_id, parent_id, body, reply_count, last_reply_at, also_sent_to_channel, edited_at, created_at,
  author:users!messages_user_id_fkey ( id, display_name, avatar_url, is_bot ),
  reactions ( emoji, user_id ),
  attachments:message_files ( position, file:files ( id, name, mime_type, size_bytes, width, height, duration_ms, storage_key ) )
`;

type ReactionRow = { emoji: string; user_id: string };
type FileRow = { storage_key: string; [k: string]: unknown };
type MessageRow = {
  id: number;
  reactions?: ReactionRow[];
  attachments?: { position: number; file: FileRow | null }[];
  [k: string]: unknown;
};

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

/** Groups reactions and swaps storage keys for short-lived signed URLs. */
export async function serializeMessages(rows: MessageRow[], uid: string) {
  const keys = rows.flatMap((r) => (r.attachments ?? []).map((a) => a.file?.storage_key)).filter(Boolean) as string[];
  const urls = new Map<string, string>();
  if (keys.length) {
    const { data } = await adminClient().storage.from('files').createSignedUrls(keys, 60 * 60);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }
  return rows.map(({ reactions, attachments, ...rest }) => ({
    ...rest,
    reactions: summarizeReactions(reactions ?? [], uid),
    files: (attachments ?? [])
      .filter((a) => a.file)
      .sort((a, b) => a.position - b.position)
      .map(({ file }) => {
        const { storage_key, ...f } = file!;
        return { ...f, url: urls.get(storage_key) ?? null };
      }),
  }));
}
