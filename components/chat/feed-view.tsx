'use client';

import { useMemo, type MouseEvent } from 'react';
import useSWR, { mutate } from 'swr';
import { Avatar } from '@/components/ui/avatar';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { fetcher, keys, useDrafts, useMe, useMembers, useSearch, useSidebar } from '@/hooks/use-chat-data';
import { useUi } from '@/hooks/use-ui';
import { useViewport } from '@/hooks/use-viewport';
import { api } from '@/lib/client/api';
import { channelLabel, colorFor, fmtTime, isOnline } from '@/lib/client/format';
import type { ConversationKind, Draft, FeedItem } from '@/lib/client/types';

type Row = {
  key: string;
  kicker: string;
  time: string;
  name: string;
  nc: string;
  initials?: string;
  avatarId?: string | null;
  avBg?: string;
  badge: string | null;
  action: string;
  text: string;
  open: () => void;
  discard?: () => void;
};

const VT = {
  mentions: ['Mentions', 'Messages where you were @mentioned', 'No mentions yet', 'When someone @mentions you, it shows up here.'],
  threads: ['Threads', 'Conversations with replies', 'No threads yet', 'Threads you follow will show up here.'],
  drafts: ['Drafts', 'Unsent messages', 'No drafts', 'Messages you start but don’t send are saved here.'],
  activity: ['Activity', 'Reactions, mentions and replies', 'Nothing new', 'Your activity will show up here.'],
} as const;

type FeedKind = keyof typeof VT;

/** Opens a conversation (also clears the search), then its thread: openConversation resets threadId. */
function openAt(conversationId: string, threadId?: number | null) {
  const ui = useUi.getState();
  ui.openConversation(conversationId);
  if (threadId != null) ui.set({ threadId });
}

const results = (n: number, q: string) => `${n} result${n === 1 ? '' : 's'} for “${q}”`;

export function FeedView() {
  const view = useUi((s) => s.view);
  const ws = useUi((s) => s.workspaceId);
  const query = useUi((s) => s.query);
  const { mobile } = useViewport();
  const { data: me } = useMe();
  const { byId } = useMembers();
  const { data: sidebar } = useSidebar();

  const kind: FeedKind | null = view === 'mentions' || view === 'threads' || view === 'drafts' || view === 'activity' ? view : null;
  const q = query.trim();
  const searchMode = !!q && !kind;

  const feedKind = kind && kind !== 'drafts' ? kind : null;
  const { data: feed } = useSWR<FeedItem[]>(ws && feedKind ? keys.feed(ws, feedKind) : null, fetcher);
  const { data: drafts } = useDrafts();
  const { data: search } = useSearch(searchMode ? q : '');

  const nameOf = (id: string, fallback: string) => byId.get(id)?.user.display_name ?? fallback;

  // "# general", "🔒 hiring", or the other people of a DM.
  const labelOf = (c: { id: string; kind: ConversationKind; name: string | null }, fallback?: string) => {
    if (c.kind !== 'dm' && c.kind !== 'group_dm') return channelLabel(c);
    const others = sidebar?.direct_messages.find((d) => d.id === c.id)?.other_user_ids ?? [];
    const names = others.map((id) => byId.get(id)?.user.display_name).filter(Boolean);
    return names.length ? names.join(', ') : fallback ?? 'Direct message';
  };

  const convById = useMemo(() => {
    const m = new Map<string, { id: string; kind: ConversationKind; name: string | null; member_count: number }>();
    sidebar?.channels.forEach((c) => m.set(c.id, c));
    sidebar?.direct_messages.forEach((c) => m.set(c.id, c));
    return m;
  }, [sidebar]);

  const discardDraft = async (d: Draft) => {
    const qs = d.parent_id != null ? `?parent_id=${d.parent_id}` : '';
    await api('DELETE', `/api/conversations/${d.conversation.id}/draft${qs}`).catch(() => {});
    if (ws) mutate(keys.feed(ws, 'drafts'));
  };

  const draftRow = (d: Draft, search?: boolean): Row => {
    const label = labelOf(d.conversation);
    return {
      key: `draft-${d.id}`,
      kicker: search ? `Draft · ${label}` : label,
      time: search ? '' : 'Draft',
      name: search ? 'Draft' : `Draft in ${label}`,
      nc: 'var(--txt2)',
      avatarId: me?.id,
      initials: me?.display_name ?? '',
      badge: '✏️',
      action: '',
      text: d.body,
      open: () => openAt(d.conversation.id, d.parent_id),
      discard: search ? undefined : () => discardDraft(d),
    };
  };

  const feedRow = (f: FeedItem, i: number): Row => {
    const actorName = f.actor ? nameOf(f.actor.id, f.actor.display_name) : 'Someone';
    const [action, badge] =
      f.item === 'reaction' ? [`reacted ${f.emoji ?? ''} to your message`, f.emoji]
        : f.item === 'thread' ? ['replied in a thread', '💬']
          : ['mentioned you', '@'];
    return {
      key: `${f.item}-${f.message_id}-${i}`,
      kicker: f.conversation ? labelOf(f.conversation, f.actor ? actorName : undefined) : '',
      time: fmtTime(f.created_at),
      name: actorName,
      nc: colorFor(f.actor?.id),
      avatarId: f.actor?.id,
      initials: actorName,
      badge,
      action,
      text: f.body,
      open: () => f.conversation && openAt(f.conversation.id, f.parent_id),
    };
  };

  let rows: Row[] | undefined;
  let title = '', sub = '', emptyTitle = '', emptySub = '';

  if (searchMode) {
    title = 'Search';
    emptyTitle = 'No results';
    emptySub = 'Try a different name, channel or keyword.';
    if (search) {
      const ql = q.toLowerCase();
      const hit = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(ql);
      rows = [
        ...search.people.map((p): Row => {
          const u = byId.get(p.id)?.user;
          return {
            key: `p-${p.id}`,
            kicker: p.is_bot ? 'App' : 'Person',
            time: isOnline(u ?? { last_seen_at: null, is_bot: p.is_bot }) ? 'Active' : 'Away',
            name: p.display_name + (p.id === me?.id ? ' (you)' : ''),
            nc: colorFor(p.id),
            avatarId: p.id,
            initials: p.display_name,
            badge: null,
            action: p.title ?? '',
            text: u?.email ?? '',
            open: () => { useUi.getState().set({ query: '' }); useUi.getState().openProfile(p.id); },
          };
        }),
        ...search.channels.map((c): Row => {
          const count = convById.get(c.id)?.member_count;
          return {
            key: `c-${c.id}`,
            kicker: 'Channel',
            time: count != null ? `${count} members` : '',
            name: channelLabel(c),
            nc: 'var(--txt)',
            avBg: 'var(--line3)',
            initials: c.kind === 'private_channel' ? '🔒' : '#',
            badge: null,
            action: '',
            text: c.topic ?? '',
            open: () => openAt(c.id),
          };
        }),
        ...search.messages.map((m): Row => {
          const conv = convById.get(m.conversation_id);
          const authorName = nameOf(m.author.id, m.author.display_name);
          const label = conv ? labelOf(conv) : '';
          const mention = !!me && m.user_id !== me.id && m.body.includes(`@${me.display_name}`);
          const kicker = label + (m.parent_id ? ' · Thread reply' : (mention ? ' · Mention' : '') + (m.reply_count ? ' · Thread' : ''));
          return {
            key: `m-${m.id}`,
            kicker,
            time: fmtTime(m.created_at),
            name: authorName,
            nc: colorFor(m.author.id),
            avatarId: m.author.id,
            initials: authorName,
            badge: m.parent_id ? '💬' : mention ? '@' : null,
            action: '',
            text: m.body,
            open: () => openAt(m.conversation_id, m.parent_id),
          };
        }),
        ...(drafts ?? []).filter((d) => hit(d.body)).map((d) => draftRow(d, true)),
      ];
      sub = results(rows.length, q);
    }
  } else if (kind) {
    [title, sub, emptyTitle, emptySub] = VT[kind];
    rows = kind === 'drafts' ? drafts?.map((d) => draftRow(d)) : feed?.map(feedRow);
    if (rows && q) {
      const ql = q.toLowerCase();
      const hit = (s: string) => s.toLowerCase().includes(ql);
      rows = rows.filter((r) => hit(r.text) || hit(r.name) || hit(r.kicker) || hit(r.action));
      sub = results(rows.length, q);
      emptyTitle = 'No results';
      emptySub = `Nothing in ${VT[kind][0]} matches “${q}”.`;
    }
  }

  return (
    <>
      <header className="flex h-14 flex-none items-center gap-3 border-b border-line" style={{ padding: `0 ${mobile ? 12 : 20}px` }}>
        {mobile && (
          <button
            onClick={() => useUi.getState().set({ mobilePane: 'list', threadId: null })}
            title="Back"
            className="-ml-2 flex size-9 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent outline-none hover:bg-hover"
          >
            <ChevronLeftIcon size={20} strokeWidth={2.2} className="text-txt" />
          </button>
        )}
        <span className="text-lg font-black">{title}</span>
        <span className="text-[13px] text-mute">{sub}</span>
      </header>
      <div className="flex-1 overflow-y-auto pt-3 pb-6">
        {rows?.map((r) => <FeedRow key={r.key} row={r} />)}
        {rows?.length === 0 && (
          <div className="px-5 py-16 text-center text-mute">
            <div className="text-base font-black text-txt2">{emptyTitle}</div>
            <div className="mt-1.5 text-sm">{emptySub}</div>
          </div>
        )}
      </div>
    </>
  );
}

function FeedRow({ row: v }: { row: Row }) {
  const discard = (e: MouseEvent) => {
    e.stopPropagation();
    v.discard?.();
  };
  return (
    <div onClick={v.open} className="flex cursor-pointer gap-3 border-b border-hover px-5 py-3.5 hover:bg-hover">
      <div className="relative size-9 flex-none">
        {v.avBg ? (
          <div className="flex size-9 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: v.avBg }}>
            {v.initials}
          </div>
        ) : (
          <Avatar id={v.avatarId} name={v.initials ?? ''} size={36} fontSize={12} />
        )}
        {v.badge && (
          <div className="absolute -right-1.5 -bottom-1.5 flex size-[22px] items-center justify-center rounded-full border-2 border-bg bg-hover text-xs leading-none">
            {v.badge}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-bold text-mute">{v.kicker}</span>
          <span className="text-xs text-mute0">{v.time}</span>
        </div>
        <div className="mt-0.5">
          <span className="font-black" style={{ color: v.nc }}>{v.name}</span> <span className="text-txt3">{v.action}</span>
        </div>
        <div className="mt-1 line-clamp-2 leading-normal text-txt2">{v.text}</div>
      </div>
      {v.discard && (
        <button
          onClick={discard}
          title="Delete draft"
          className="h-[30px] cursor-pointer self-center rounded-md border border-line3 bg-transparent px-2.5 text-xs font-bold text-txt3 outline-none hover:border-danger hover:text-danger-text"
        >
          Delete
        </button>
      )}
    </div>
  );
}
