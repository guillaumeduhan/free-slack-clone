'use client';

import { mutate } from 'swr';
import { api } from './api';
import type { FileInfo, Message, Reaction } from './types';
import { keys } from '@/hooks/use-chat-data';

/** Revalidates every cached key that starts with one of the prefixes. */
export const refresh = (...prefixes: string[]) =>
  mutate((key) => typeof key === 'string' && prefixes.some((p) => key.startsWith(p)));

export async function sendMessage(conversationId: string, text: string, fileIds: string[] = []) {
  const msg = await api<Message>('POST', `/api/conversations/${conversationId}/messages`, { text, file_ids: fileIds });
  await mutate(keys.messages(conversationId));
  return msg;
}

export async function sendReply(rootId: number, text: string, alsoToChannel: boolean, fileIds: string[] = []) {
  const msg = await api<Message>('POST', `/api/messages/${rootId}/replies`, { text, also_send_to_channel: alsoToChannel, file_ids: fileIds });
  await Promise.all([mutate(keys.thread(rootId)), mutate(keys.messages(msg.conversation_id))]);
  return msg;
}

/** Toggles my reaction, optimistically updating the timeline / thread caches. */
export async function toggleReaction(msg: Pick<Message, 'id' | 'conversation_id' | 'parent_id' | 'reactions'>, emoji: string) {
  const mine = msg.reactions.find((r) => r.emoji === emoji)?.mine;
  const patch = (rs: Reaction[]): Reaction[] => {
    const i = rs.findIndex((r) => r.emoji === emoji);
    if (i < 0) return [...rs, { emoji, count: 1, mine: true, user_ids: [] }];
    const r = rs[i];
    const count = r.count + (r.mine ? -1 : 1);
    return count <= 0 ? rs.filter((_, j) => j !== i) : rs.map((x, j) => (j === i ? { ...r, count, mine: !r.mine } : x));
  };
  const apply = (m: Message) => (m.id === msg.id ? { ...m, reactions: patch(m.reactions) } : m);
  mutate(keys.messages(msg.conversation_id), (d?: { messages: Message[]; next_before: number | null }) =>
    d && { ...d, messages: d.messages.map(apply) }, { revalidate: false });
  const rootId = msg.parent_id ?? msg.id;
  mutate(keys.thread(rootId), (d?: { root: Message; replies: Message[] }) =>
    d && { root: apply(d.root), replies: d.replies.map(apply) }, { revalidate: false });
  try {
    if (mine) await api('DELETE', `/api/messages/${msg.id}/reactions?emoji=${encodeURIComponent(emoji)}`);
    else await api('POST', `/api/messages/${msg.id}/reactions`, { emoji });
  } finally {
    mutate(keys.messages(msg.conversation_id));
    mutate(keys.thread(rootId));
  }
}

export async function toggleSaved(msg: Pick<Message, 'id' | 'conversation_id' | 'parent_id' | 'saved'>) {
  await api(msg.saved ? 'DELETE' : 'PUT', `/api/messages/${msg.id}/save`);
  await Promise.all([mutate(keys.messages(msg.conversation_id)), mutate(keys.thread(msg.parent_id ?? msg.id))]);
  refresh('/api/me/feed');
}

export async function deleteMessage(msg: Pick<Message, 'id' | 'conversation_id' | 'parent_id'>) {
  await api('DELETE', `/api/messages/${msg.id}`);
  await Promise.all([mutate(keys.messages(msg.conversation_id)), mutate(keys.thread(msg.parent_id ?? msg.id))]);
}

export async function markRead(conversationId: string, messageId: number, workspaceId: string) {
  await api('POST', `/api/conversations/${conversationId}/read`, { message_id: messageId });
  await mutate(keys.sidebar(workspaceId));
}

export async function saveDraft(conversationId: string, body: string, parentId: number | null = null) {
  await api('PUT', `/api/conversations/${conversationId}/draft`, { body, parent_id: parentId });
}

/** Registers a file, uploads its bytes, returns the file row (id goes in file_ids). */
export async function uploadFile(workspaceId: string, file: Blob & { name: string }) {
  const meta = { name: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size };
  const res = await api<{ file: FileInfo; upload: { url: string } }>('POST', `/api/workspaces/${workspaceId}/files`, meta);
  const put = await fetch(res.upload.url, { method: 'PUT', body: file });
  if (!put.ok) throw new Error('Upload failed');
  return { ...res.file, url: `/api/files/${res.file.id}/content` };
}

export async function signOut() {
  await api('POST', '/api/auth/logout').catch(() => {});
  window.location.href = '/login';
}
