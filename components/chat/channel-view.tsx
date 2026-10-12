'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUi } from '@/hooks/use-ui';
import { useConversation, useMe, useMembers, useMessages, useSidebar } from '@/hooks/use-chat-data';
import { useViewport } from '@/hooks/use-viewport';
import { markRead } from '@/lib/client/chat-actions';
import { channelTitle, dayLabel, initials, isOnline, sameDay } from '@/lib/client/format';
import type { MentionTarget } from '@/lib/client/rich-text';
import type { Message, User } from '@/lib/client/types';
import { ChevronLeftIcon, MoreIcon, UsersIcon } from '@/components/ui/icons';
import { MessageItem } from './message-item';
import { Composer } from './composer';

/** Display info for the open conversation: title, topic, intro and composer placeholder. */
export function useConversationInfo(id: string | null) {
  const { data: conv } = useConversation(id);
  const { data: sidebar } = useSidebar();
  const { data: me } = useMe();
  const { byId } = useMembers();
  const item = [...(sidebar?.channels ?? []), ...(sidebar?.direct_messages ?? [])].find((c) => c.id === id);
  const kind = conv?.kind ?? item?.kind;
  if (!kind) return null;
  const name = conv?.name ?? item?.name ?? '';
  if (kind === 'public_channel' || kind === 'private_channel') {
    const title = channelTitle({ kind, name });
    return {
      isChannel: true, title, prefix: kind === 'private_channel' ? '◦' : '#',
      topic: conv?.topic ?? item?.topic ?? '',
      intro: conv?.description || conv?.topic || `This is the very beginning of the ${title} channel.`,
      memberCount: conv?.member_count ?? item?.member_count ?? 0, others: [] as User[],
    };
  }
  const others = (item?.other_user_ids ?? []).map((u) => byId.get(u)?.user).filter((u): u is User => !!u);
  const title = others.length ? others.map((u) => u.display_name).join(', ') : `${me?.display_name ?? ''} (you)`;
  return {
    isChannel: false, title, prefix: kind === 'group_dm' ? String(others.length + 1) : initials(others[0]?.display_name ?? me?.display_name ?? '?'),
    topic: kind === 'group_dm' ? `${others.length + 1} members` : isOnline(others[0] ?? me ?? null) ? 'Active' : 'Away',
    intro: others.length ? `This is the start of your conversation with ${title}.` : 'This is your space. Draft messages, list your to-dos, or keep links and files handy.',
    memberCount: others.length + 1, others,
  };
}

/** Workspace members as @mention targets. */
export function usePeople(): MentionTarget[] {
  const { data } = useMembers();
  return useMemo(() => (data?.members ?? []).map((m) => ({ id: m.user.id, display_name: m.user.display_name })), [data]);
}

const GROUP_GAP_MS = 5 * 60_000;
const FLASH_MS = 4000;

/**
 * Messages that arrive while the conversation is open flash for 4s (design: flashNew);
 * messages that were unread when it was opened keep the "New" styling until you leave.
 */
function useFlash(conversationId: string | null, messages: Message[] | undefined, meId: string | undefined) {
  const [state, setState] = useState<{ conv: string | null; openedAt: number | null; flashing: number[] }>({ conv: null, openedAt: null, flashing: [] });
  const lastId = messages?.at(-1)?.id ?? 0;
  if (messages && state.conv !== conversationId) {
    setState({ conv: conversationId, openedAt: lastId, flashing: [] });
  } else if (messages && state.openedAt != null && lastId > state.openedAt) {
    const fresh = messages.filter((m) => m.id > state.openedAt! && m.user_id !== meId).map((m) => m.id);
    setState({ ...state, openedAt: lastId, flashing: [...state.flashing, ...fresh] });
  }
  useEffect(() => {
    if (!state.flashing.length) return;
    const t = setTimeout(() => setState((s) => ({ ...s, flashing: [] })), FLASH_MS);
    return () => clearTimeout(t);
  }, [state.flashing]);
  return { openedAt: state.conv === conversationId ? state.openedAt : null, flashing: state.flashing };
}

export function ChannelView() {
  const conversationId = useUi((s) => s.conversationId);
  const workspaceId = useUi((s) => s.workspaceId);
  const seenUpTo = useUi((s) => (conversationId ? s.seenUpTo[conversationId] : null));
  const set = useUi((s) => s.set);
  const { mobile } = useViewport();
  const info = useConversationInfo(conversationId);
  const { data: me } = useMe();
  const { byId } = useMembers();
  const people = usePeople();
  const { data } = useMessages(conversationId);
  const messages = data?.messages;
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const { openedAt, flashing } = useFlash(conversationId, messages, me?.id);

  // Keep the list pinned to the bottom unless the reader scrolled up.
  const lastId = messages?.at(-1)?.id;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId, conversationId, messages?.length]);
  useEffect(() => { stick.current = true; }, [conversationId]);

  // Mark as read when new messages are visible.
  useEffect(() => {
    if (!conversationId || !workspaceId || !lastId || document.hidden) return;
    markRead(conversationId, lastId, workspaceId).catch(() => {});
  }, [conversationId, workspaceId, lastId]);

  const rows = useMemo(() => {
    if (!messages || !me) return [];
    let dividerShown = false;
    return messages.map((m, i) => {
      const prev: Message | undefined = messages[i - 1];
      const newDay = !prev || !sameDay(prev.created_at, m.created_at);
      const showHead =
        newDay || !prev || prev.user_id !== m.user_id || prev.reply_count > 0 || m.reply_count > 0 ||
        new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_GAP_MS;
      const unreadAtOpen = seenUpTo != null && openedAt != null && m.id > seenUpTo && m.id <= openedAt && m.user_id !== me.id;
      const isNew = unreadAtOpen || flashing.includes(m.id);
      const newDivider = isNew && !dividerShown;
      if (isNew) dividerShown = true;
      return { m, showHead, day: newDay ? dayLabel(m.created_at) : null, isNew, newDivider };
    });
  }, [messages, me, seenUpTo, openedAt, flashing]);

  if (!info || !me) return <div className="flex-1" />;
  const authorName = (m: Message) => byId.get(m.user_id)?.user.display_name ?? m.author.display_name;

  return (
    <>
      <header className="flex h-14 flex-none items-center gap-3 border-b border-line" style={{ padding: `0 ${mobile ? 12 : 20}px` }}>
        {mobile && (
          <button onClick={() => set({ mobilePane: 'list', threadId: null })} title="Back"
            className="-ml-2 flex size-9 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-txt outline-none hover:bg-hover">
            <ChevronLeftIcon size={20} strokeWidth={2.2} />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className="max-w-full flex-none truncate text-[15px] font-bold">{info.title}</span>
          <span className="truncate text-[13px] text-mute">{info.topic}</span>
        </div>
        <div className="flex flex-none items-center gap-2">
          <div
            onClick={() => (info.isChannel ? set({ membersOf: conversationId }) : info.others[0] && useUi.getState().openProfile(info.others[0].id))}
            title="View members"
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-txt3 hover:bg-hover hover:text-txt"
          >
            <UsersIcon size={14} />
            {info.memberCount}
          </div>
          <button
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (info.isChannel) set({ membersOf: conversationId });
              else set({ ctx: { section: 'dms', x: Math.min(r.left, window.innerWidth - 270), y: r.bottom + 6 } });
            }}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-line bg-bg text-txt outline-none hover:bg-hover"
          >
            <MoreIcon size={15} />
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto pt-5 pb-2"
      >
        <div className="px-5 pt-2 pb-6">
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg border border-line font-mono text-lg">{info.prefix}</div>
          <div className="text-xl font-bold tracking-[-0.01em]">{info.title}</div>
          <div className="mt-1 text-pretty text-mute">{info.intro}</div>
        </div>
        {rows.map((r) => (
          <MessageItem
            key={r.m.id}
            msg={r.m}
            showHead={r.showHead}
            dayLabel={r.day}
            isNew={r.isNew}
            newDivider={r.newDivider}
            people={people}
            meId={me.id}
            authorName={authorName(r.m)}
          />
        ))}
      </div>

      <Composer key={conversationId} conversationId={conversationId!} placeholder={`Message ${info.title}`} isChannel={info.isChannel} />
    </>
  );
}
