'use client';

import { useEffect, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api } from '@/lib/client/api';
import type {
  AppDetail, AppSummary, Conversation, Draft, FeedItem, Invitation, Me, Member, Message, Preferences, SearchResult,
  Sidebar, User, Workspace,
} from '@/lib/client/types';
import { useUi } from './use-ui';

/** SWR fetcher for the { ok, data } API. */
export const fetcher = <T,>(url: string) => api<T>('GET', url);

const opts = { revalidateOnFocus: true, dedupingInterval: 1000 };

export const keys = {
  me: '/api/me',
  workspaces: '/api/workspaces',
  workspace: (ws: string) => `/api/workspaces/${ws}`,
  sidebar: (ws: string) => `/api/workspaces/${ws}/conversations`,
  browse: (ws: string) => `/api/workspaces/${ws}/conversations?browse=1`,
  members: (ws: string) => `/api/workspaces/${ws}/members`,
  invitations: (ws: string) => `/api/workspaces/${ws}/invitations`,
  apps: (ws: string) => `/api/workspaces/${ws}/apps`,
  app: (id: string) => `/api/apps/${id}`,
  prefs: (ws: string) => `/api/me/preferences?workspace_id=${ws}`,
  feed: (ws: string, kind: string) => `/api/me/feed?workspace_id=${ws}&kind=${kind}`,
  search: (ws: string, q: string) => `/api/workspaces/${ws}/search?q=${encodeURIComponent(q)}`,
  conversation: (id: string) => `/api/conversations/${id}`,
  convMembers: (id: string) => `/api/conversations/${id}/members`,
  messages: (id: string) => `/api/conversations/${id}/messages?limit=100`,
  thread: (id: number) => `/api/messages/${id}/replies`,
};

export const useMe = () => useSWR<Me>(keys.me, fetcher, opts);
export const useWorkspaces = () => useSWR<Workspace[]>(keys.workspaces, fetcher, opts);

export function useWorkspace() {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<Workspace>(ws ? keys.workspace(ws) : null, fetcher, opts);
}

export function useSidebar() {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<Sidebar>(ws ? keys.sidebar(ws) : null, fetcher, opts);
}

export function useMembers() {
  const ws = useUi((s) => s.workspaceId);
  const res = useSWR<{ members: Member[]; counts: Record<string, number> }>(ws ? keys.members(ws) : null, fetcher, opts);
  const byId = useMemo(() => {
    const m = new Map<string, Member>();
    res.data?.members.forEach((x) => m.set(x.user.id, x));
    return m;
  }, [res.data]);
  return { ...res, byId };
}

/** Workspace members + people seen in messages (bots, removed people). */
export function useUser(id: string | null | undefined): User | null {
  const { byId } = useMembers();
  return id ? byId.get(id)?.user ?? null : null;
}

export function useConversation(id: string | null) {
  return useSWR<Conversation>(id ? keys.conversation(id) : null, fetcher, opts);
}

export function useMessages(id: string | null) {
  return useSWR<{ messages: Message[]; next_before: number | null }>(id ? keys.messages(id) : null, fetcher, opts);
}

export function useThread(id: number | null) {
  return useSWR<{ root: Message; replies: Message[] }>(id ? keys.thread(id) : null, fetcher, opts);
}

export function useFeed(kind: 'mentions' | 'threads' | 'activity' | 'saved') {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<FeedItem[]>(ws ? keys.feed(ws, kind) : null, fetcher, opts);
}

export function useDrafts() {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<Draft[]>(ws ? keys.feed(ws, 'drafts') : null, fetcher, opts);
}

export function usePrefs() {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<Preferences>(ws ? keys.prefs(ws) : null, fetcher, opts);
}

export function useApps() {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<AppSummary[]>(ws ? keys.apps(ws) : null, fetcher, opts);
}

export const useApp = (id: string | null) => useSWR<AppDetail>(id ? keys.app(id) : null, fetcher, opts);

export function useInvitations(enabled: boolean) {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<Invitation[]>(ws && enabled ? keys.invitations(ws) : null, fetcher, opts);
}

export function useBrowse(enabled: boolean) {
  const ws = useUi((s) => s.workspaceId);
  return useSWR<{ id: string; name: string; topic: string | null; member_count: number; joined: boolean }[]>(
    ws && enabled ? keys.browse(ws) : null, fetcher, opts,
  );
}

export function useSearch(q: string) {
  const ws = useUi((s) => s.workspaceId);
  const term = q.trim();
  return useSWR<SearchResult>(ws && term ? keys.search(ws, term) : null, fetcher, { ...opts, keepPreviousData: true });
}

export const useConvMembers = (id: string | null) =>
  useSWR<{ joined_at: string; user: User }[]>(id ? keys.convMembers(id) : null, fetcher, opts);

/**
 * Live updates: one EventSource per workspace. Each change revalidates the
 * SWR keys it affects; the UI re-renders from fresh API data.
 */
export function useRealtime() {
  const ws = useUi((s) => s.workspaceId);
  const { mutate } = useSWRConfig();
  useEffect(() => {
    if (!ws) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<string>();
    const flush = () => {
      timer = null;
      const list = [...pending];
      pending.clear();
      mutate((key) => typeof key === 'string' && list.some((p) => key.startsWith(p)));
    };
    const touch = (...prefixes: string[]) => {
      prefixes.forEach((p) => pending.add(p));
      timer ??= setTimeout(flush, 120);
    };
    const es = new EventSource(`/api/workspaces/${ws}/events`);
    es.addEventListener('change', (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as {
        table: string; conversation_id: string | null; message_id: number | null; parent_id: number | null;
      };
      touch(keys.sidebar(ws), `/api/me/feed?workspace_id=${ws}`);
      if (e.conversation_id) touch(`/api/conversations/${e.conversation_id}`);
      if (e.parent_id) touch(keys.thread(e.parent_id));
      if (e.message_id && e.table !== 'conversation_members') touch(keys.thread(e.message_id));
      if (e.table === 'conversations') touch(keys.browse(ws));
      if (e.table === 'messages') touch(`/api/workspaces/${ws}/search`, '/api/apps/');
    });
    // Presence: keep last_seen_at fresh and refresh teammates' presence.
    const beat = setInterval(() => { mutate(keys.me); mutate(keys.members(ws)); }, 60_000);
    return () => {
      es.close();
      clearInterval(beat);
      if (timer) clearTimeout(timer);
    };
  }, [ws, mutate]);
}
