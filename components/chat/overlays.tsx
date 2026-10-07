'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useUi, type CtxMenu } from '@/hooks/use-ui';
import {
  keys, useMe, useMembers, useMessages, usePrefs, useSidebar, useThread, useWorkspace,
} from '@/hooks/use-chat-data';
import { api } from '@/lib/client/api';
import { deleteMessage, markRead, refresh, signOut, toggleSaved } from '@/lib/client/chat-actions';
import { colorFor, fmtSize, fmtTime, initials, isOnline, localTime } from '@/lib/client/format';
import type { Conversation, Message } from '@/lib/client/types';
import { cn } from '@/lib/client/cn';
import { Avatar } from '@/components/ui/avatar';
import { DialogButton, Modal } from '@/components/ui/modal';
import { EmojiGrid, POPOVER } from '@/components/ui/emoji-grid';
import {
  BellIcon, BookmarkIcon, BrowseIcon, CheckSquareIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, CloseIcon,
  CollapseIcon, CopyIcon, DownloadIcon, HashIcon, InviteIcon, LogoutIcon, PenIcon, ReplyIcon, SettingsIcon, SortIcon,
  TrashIcon,
} from '@/components/ui/icons';

// ---------------------------------------------------------------------
// Hover card timers (shared by every name that opens the card)
// ---------------------------------------------------------------------
let hcTimer: ReturnType<typeof setTimeout> | undefined;

export const hoverCardTimers = {
  /** Opens the card for userId above (or below) the hovered element after 350ms. */
  show(userId: string, r: DOMRect) {
    clearTimeout(hcTimer);
    const W = 300, H = 230;
    const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left));
    const top = r.top - H - 8 > 8 ? r.top - H - 8 : r.bottom + 8;
    hcTimer = setTimeout(() => useUi.setState({ hoverCard: { userId, left, top } }), 350);
  },
  hide() {
    clearTimeout(hcTimer);
    hcTimer = setTimeout(() => useUi.setState({ hoverCard: null }), 200);
  },
  stay() {
    clearTimeout(hcTimer);
  },
};

/** Finds a message in the open conversation's timeline or the open thread. */
function useCachedMessage(id: number | null, conversationId: string | null): Message | null {
  const threadId = useUi((s) => s.threadId);
  const { data: list } = useMessages(id != null ? conversationId : null);
  const { data: thread } = useThread(id != null ? threadId : null);
  if (id == null) return null;
  return (
    list?.messages.find((m) => m.id === id) ??
    (thread?.root.id === id ? thread.root : thread?.replies.find((m) => m.id === id)) ??
    null
  );
}

// ---------------------------------------------------------------------
// Reaction picker
// ---------------------------------------------------------------------
export function ReactionPicker() {
  const picker = useUi((s) => s.picker);
  if (!picker) return null;
  const close = () => useUi.getState().set({ picker: null });
  return (
    <>
      <div onClick={close} className="fixed inset-0 z-[58]" />
      <div className={cn('fixed z-[60] w-[296px] p-2.5', POPOVER)} style={{ top: picker.top, left: picker.left }}>
        <div className="px-1 pb-1.5 text-xs font-bold text-mute">Reactions</div>
        <EmojiGrid onPick={(e) => { picker.onPick(e); close(); }} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------
type Item = { label: string; icon?: ReactNode; run: () => void; divider?: boolean; danger?: boolean; hasSub?: boolean };

export function ContextMenu() {
  const ctx = useUi((s) => s.ctx);
  if (!ctx) return null;
  return <CtxPanel key={`${ctx.section}:${ctx.x}:${ctx.y}`} ctx={ctx} />;
}

function CtxPanel({ ctx }: { ctx: CtxMenu }) {
  const [sub, setSub] = useState(false);
  const unreadOnly = useUi((s) => s.unreadOnly);
  const collapsed = useUi((s) => s.collapsed);
  const sortAZ = useUi((s) => s.sortAZ);
  const { set } = useUi.getState();
  const { data: me } = useMe();
  const { data: ws } = useWorkspace();
  const { data: sidebar } = useSidebar();
  const msg = useCachedMessage(ctx.section === 'msg' ? ctx.messageId : null, ctx.section === 'msg' ? ctx.conversationId : null);

  const close = () => { set({ ctx: null }); setSub(false); };
  const T = (label: string, icon: ReactNode, run: () => void, extra?: Partial<Item>): Item => ({ label, icon, run, ...extra });
  const wsName = ws?.name || 'workspace';
  const sec = ctx.section;

  let title = '';
  let items: Item[] = [];
  let subItems: Item[] = [];
  if (sec === 'msg') {
    title = 'Message';
    if (msg) {
      items = [
        T('Reply in thread', <ReplyIcon />, () => set({ threadId: msg.parent_id ?? msg.id })),
        T(msg.saved ? 'Remove from saved' : 'Save for later', <BookmarkIcon />, () => { toggleSaved(msg).catch(() => {}); }),
        T('Copy text', <CopyIcon />, () => { navigator.clipboard?.writeText(msg.body).catch(() => {}); }),
      ];
      if (msg.user_id === me?.id) {
        items.push(T('Delete message…', <TrashIcon />, () => set({ deleteTarget: msg.id }), { divider: true, danger: true }));
      }
    }
  } else if (sec === 'channel') {
    const c = sidebar?.channels.find((x) => x.id === ctx.conversationId);
    const isAdmin = ws?.role === 'owner' || ws?.role === 'admin';
    title = c ? `${c.kind === 'private_channel' ? '🔒' : '#'} ${c.name}` : 'Channel';
    if (c) {
      if (c.unread > 0 && c.last_message_id != null) {
        items.push(T('Mark as read', <CheckSquareIcon />, () => {
          const wsId = useUi.getState().workspaceId;
          if (wsId) markRead(c.id, c.last_message_id!, wsId).catch(() => {});
        }));
      }
      items.push(T('View members', <InviteIcon />, () => set({ membersOf: c.id })));
      if (c.name !== 'general') {
        items.push(T('Leave channel', <LogoutIcon />, () => {
          api('DELETE', `/api/conversations/${c.id}/members`)
            .then(() => refresh(`/api/workspaces/${useUi.getState().workspaceId}/conversations`))
            .catch(() => {});
        }));
        if (isAdmin) items.push(T('Delete channel…', <TrashIcon />, () => set({ deleteChannel: c.id }), { divider: true, danger: true }));
      }
    }
  } else if (sec === 'ws') {
    title = ws?.name ?? '';
    items = [
      T(`Invite people to ${wsName}`, <InviteIcon />, () => set({ settings: 'members' })),
      T('Workspace settings', <SettingsIcon />, () => set({ settings: 'general' })),
      T('Notifications', <BellIcon />, () => set({ settings: 'notifications' })),
      T(`Sign out of ${wsName}`, <LogoutIcon />, () => { signOut(); }, { divider: true }),
    ];
  } else {
    title = sec === 'channels' ? 'Channels' : 'Direct messages';
    const list = (sec === 'channels' ? sidebar?.channels : sidebar?.direct_messages) ?? [];
    items = [
      T('Mark all as read', <CheckSquareIcon />, () => {
        const wsId = useUi.getState().workspaceId;
        if (!wsId) return;
        list.filter((c) => c.unread > 0 && c.last_message_id != null)
          .forEach((c) => { markRead(c.id, c.last_message_id!, wsId).catch(() => {}); });
      }),
    ];
    if (sec === 'channels') {
      items.push(T('Create a channel', <HashIcon />, () => set({ modal: 'channel' })), T('Browse channels', <BrowseIcon />, () => set({ modal: 'browse' })));
    } else {
      items.push(T('New message', <PenIcon />, () => set({ modal: 'dm' })));
    }
    const uo = unreadOnly[sec];
    items.push(T(uo ? 'Show all conversations' : 'Show only unreads', <CheckSquareIcon />, () => set({ unreadOnly: { ...unreadOnly, [sec]: !uo } }), { divider: true }));
    items.push({ label: 'Manage section', run: () => setSub(true), hasSub: true });
    const col = !!collapsed[sec];
    subItems = [T(col ? 'Expand section' : 'Collapse section', <CollapseIcon />, () => set({ collapsed: { ...collapsed, [sec]: !col } }))];
    if (sec === 'dms') subItems.push(T(sortAZ ? 'Sort by default' : 'Sort A to Z', <SortIcon />, () => set({ sortAZ: !sortAZ })));
  }

  const runItem = (it: Item) => {
    if (it.hasSub) return it.run();
    it.run();
    close();
  };
  const dismiss = (e: React.MouseEvent) => { e.preventDefault(); close(); };

  return (
    <>
      <div onClick={dismiss} onContextMenu={dismiss} className="fixed inset-0 z-[70]" />
      <div
        className="fixed z-[71] w-max max-w-[min(360px,calc(100vw-16px))] min-w-[260px] rounded-[10px] border border-line3 bg-hover py-2 text-sm shadow-[0_16px_40px_rgba(0,0,0,.55)]"
        style={{ top: ctx.y, left: ctx.x }}
      >
        <div className="truncate px-4 pt-1 pb-2 text-xs font-bold text-mute">{title}</div>
        {items.map((it) => (
          <div key={it.label}>
            {it.divider && <div className="my-1.5 h-px bg-line3" />}
            <div
              onClick={() => runItem(it)}
              onMouseEnter={() => setSub(!!it.hasSub)}
              className={cn(
                'relative flex h-[34px] cursor-pointer items-center gap-3 px-4 hover:text-white',
                it.danger ? 'text-[#ff6369] hover:bg-[#e5484d]' : 'text-txt2 hover:bg-[#7c3aed]',
              )}
            >
              <span className="flex size-[18px] flex-none items-center justify-center">{it.icon}</span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap">{it.label}</span>
              {it.hasSub && <ChevronRightIcon size={14} />}
            </div>
          </div>
        ))}
        {sub && subItems.length > 0 && (
          <div
            className="absolute left-[calc(100%+4px)] w-[230px] rounded-[10px] border border-line3 bg-hover py-1.5 shadow-[0_16px_40px_rgba(0,0,0,.55)]"
            style={{ top: 30 + (items.length - 1) * 34 }}
          >
            {subItems.map((it) => (
              <div
                key={it.label}
                onClick={() => runItem(it)}
                className="flex h-[34px] cursor-pointer items-center gap-3 px-4 text-txt2 hover:bg-[#7c3aed] hover:text-white"
              >
                <span className="flex size-[18px] flex-none items-center justify-center">{it.icon}</span>
                <span className="min-w-0 flex-1 truncate whitespace-nowrap">{it.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Hover card
// ---------------------------------------------------------------------
export function HoverCardPopup() {
  const hc = useUi((s) => s.hoverCard);
  const workspaceId = useUi((s) => s.workspaceId);
  const { byId } = useMembers();
  const { data: me } = useMe();
  const { data: prefs } = usePrefs();
  const user = hc ? byId.get(hc.userId)?.user : null;
  if (!hc || !user) return null;

  const isMe = user.id === me?.id;
  const dnd = isMe && !!prefs?.dnd_enabled;
  const online = isOnline(isMe ? { ...user, last_seen_at: me?.last_seen_at ?? user.last_seen_at } : user);
  const dot = dnd ? '#fbbf24' : online ? 'var(--online)' : 'var(--mute2)';
  const color = colorFor(user.id);
  const profile = () => useUi.getState().openProfile(user.id);
  const message = async () => {
    useUi.getState().set({ hoverCard: null });
    if (!workspaceId) return;
    const conv = await api<Conversation>('POST', `/api/workspaces/${workspaceId}/dms`, { user_ids: [user.id] });
    await refresh(keys.sidebar(workspaceId));
    useUi.getState().openConversation(conv.id);
  };

  return (
    <div
      onMouseEnter={hoverCardTimers.stay}
      onMouseLeave={hoverCardTimers.hide}
      className="fixed z-[65] w-[300px] overflow-hidden rounded-xl border border-line3 bg-bg shadow-[0_16px_40px_rgba(0,0,0,.45)]"
      style={{ left: hc.left, top: hc.top }}
    >
      <div className="h-14 opacity-35" style={{ background: color }} />
      <div className="-mt-8 px-4 pb-4">
        <div className="relative size-16">
          <div
            className="flex size-16 items-center justify-center rounded-xl border-[3px] border-bg text-[22px] font-black text-white"
            style={{ background: color }}
          >
            {initials(user.display_name)}
          </div>
          <span className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-[3px] border-bg" style={{ background: dot }} />
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span onClick={profile} className="cursor-pointer truncate text-[17px] font-black hover:underline">
            {user.display_name}{isMe && ' (you)'}
          </span>
          {user.is_bot && <span className="flex-none rounded border border-line bg-hover px-[5px] py-px text-[11px] font-bold text-mute">BOT</span>}
        </div>
        <div className="mt-0.5 truncate text-sm text-txt3">{user.is_bot ? 'App' : user.title ?? ''}</div>
        <div className="mt-2.5 flex flex-col gap-1 text-[13px] text-mute">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: dot }} />
            {dnd ? 'Do not disturb' : online ? 'Active' : 'Away'}
          </span>
          <span className="flex items-center gap-2">
            <ClockIcon size={13} />
            {localTime(user.timezone)} local time
          </span>
        </div>
        <div className="mt-3.5 flex gap-2">
          {!isMe && !user.is_bot && (
            <button onClick={message} className="h-8 flex-1 cursor-pointer whitespace-nowrap rounded-md border-0 bg-[#7c3aed] text-[13px] font-bold text-white outline-none">
              Message
            </button>
          )}
          <button
            onClick={profile}
            className="h-8 flex-1 cursor-pointer whitespace-nowrap rounded-md border border-line3 bg-transparent text-[13px] font-bold text-txt outline-none hover:bg-hover"
          >
            View profile
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------
export function Lightbox() {
  const lb = useUi((s) => s.lightbox);
  const { byId } = useMembers();

  useEffect(() => {
    if (!lb) return;
    const onKey = (e: KeyboardEvent) => {
      const L = useUi.getState().lightbox;
      if (!L) return;
      const n = L.files.length;
      if (e.key === 'Escape') useUi.getState().set({ lightbox: null });
      if (e.key === 'ArrowRight') useUi.getState().set({ lightbox: { ...L, index: (L.index + 1) % n } });
      if (e.key === 'ArrowLeft') useUi.getState().set({ lightbox: { ...L, index: (L.index - 1 + n) % n } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lb]);

  if (!lb) return null;
  const file = lb.files[lb.index];
  if (!file) return null;
  const n = lb.files.length;
  const multi = n > 1;
  const author = byId.get(lb.authorId)?.user.display_name ?? '';
  const close = () => useUi.getState().set({ lightbox: null });
  const go = (d: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    useUi.getState().set({ lightbox: { ...lb, index: (lb.index + d + n) % n } });
  };
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const navBtn = 'flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 text-white outline-none hover:bg-white/20';

  return (
    <div onClick={close} className="fixed inset-0 z-[90] flex flex-col bg-black/[.88]">
      <div onClick={stop} className="flex h-[60px] flex-none items-center gap-3 pr-4 pl-5 text-[#fafafa]">
        <Avatar id={lb.authorId} name={author} size={32} radius={6} fontSize={11} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{file.name}</div>
          <div className="text-xs text-[#a6a7ae]">{author} · {fmtTime(lb.createdAt)} · {fmtSize(file.size_bytes)}</div>
        </div>
        {multi && <span className="text-[13px] text-[#a6a7ae]">{lb.index + 1} / {n}</span>}
        <a
          href={`${file.url}?download`}
          download={file.name}
          title="Download"
          className="flex size-9 items-center justify-center rounded-md text-[#fafafa] outline-none hover:bg-white/10"
        >
          <DownloadIcon />
        </a>
        <button onClick={close} title="Close" className="flex size-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[#fafafa] outline-none hover:bg-white/10">
          <CloseIcon size={20} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-4 pb-6">
        {multi && <button onClick={go(-1)} title="Previous" className={navBtn}><ChevronLeftIcon size={20} strokeWidth={2.2} /></button>}
        <div
          onClick={stop}
          role="img"
          aria-label={file.name}
          className="h-full min-w-0 max-w-[1200px] flex-1 bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${file.url}")` }}
        />
        {multi && <button onClick={go(1)} title="Next" className={navBtn}><ChevronRightIcon size={20} strokeWidth={2.2} /></button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------
export function DeleteDialog() {
  const target = useUi((s) => s.deleteTarget);
  const conversationId = useUi((s) => s.conversationId);
  const msg = useCachedMessage(target, conversationId);
  const [busy, setBusy] = useState(false);
  if (target == null) return null;

  const close = () => useUi.getState().set({ deleteTarget: null });
  const confirm = async () => {
    if (!msg || busy) return;
    setBusy(true);
    try {
      await deleteMessage(msg);
      const { threadId } = useUi.getState();
      useUi.getState().set({ deleteTarget: null, ...(threadId === msg.id && { threadId: null }) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={close} width={460} top="16vh" z={80} className="p-5">
      <div className="text-lg font-black">Delete message</div>
      <div className="mt-1.5 text-sm text-mute">Are you sure you want to delete this message? This can&apos;t be undone.</div>
      <div className="mt-4 rounded-lg border border-line bg-hover px-3.5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-black" style={{ color: colorFor(msg?.user_id) }}>{msg?.author.display_name}</span>
          <span className="text-xs text-mute">{msg ? fmtTime(msg.created_at) : ''}</span>
        </div>
        <div className="mt-0.5 max-h-[120px] overflow-hidden leading-normal whitespace-pre-wrap text-txt2">{msg?.body}</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <DialogButton variant="secondary" onClick={close}>Cancel</DialogButton>
        <DialogButton variant="danger" onClick={confirm}>Delete</DialogButton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Delete channel confirmation (owners and admins)
// ---------------------------------------------------------------------
export function DeleteChannelDialog() {
  const id = useUi((s) => s.deleteChannel);
  const { data: sidebar } = useSidebar();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!id) return null;
  const c = sidebar?.channels.find((x) => x.id === id);
  const label = c ? `${c.kind === 'private_channel' ? '🔒' : '#'} ${c.name}` : 'this channel';

  const close = () => { useUi.getState().set({ deleteChannel: null }); setError(''); };
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api('DELETE', `/api/conversations/${id}`);
      const s = useUi.getState();
      // The shell reopens #general when the open conversation disappears.
      s.set({ deleteChannel: null, ...(s.conversationId === id && { conversationId: null, threadId: null }) });
      await refresh(`/api/workspaces/${s.workspaceId}/conversations`, '/api/me/feed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the channel');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={close} width={460} top="16vh" z={80} className="p-5">
      <div className="text-lg font-black">Delete channel</div>
      <div className="mt-1.5 text-sm text-mute">
        Are you sure you want to delete <strong className="text-txt2">{label}</strong>? All of its messages and files will be
        removed for everyone. This can&apos;t be undone.
      </div>
      {error && <div className="mt-3 text-[13px] text-danger-text">{error}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <DialogButton variant="secondary" onClick={close}>Cancel</DialogButton>
        <DialogButton variant="danger" onClick={confirm}>Delete channel</DialogButton>
      </div>
    </Modal>
  );
}
