'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { PAGE, useUi, type Section, type View } from '@/hooks/use-ui';
import { useApps, useDrafts, useFeed, useInvitations, useMe, useMembers, useSidebar, useWorkspace } from '@/hooks/use-chat-data';
import { useViewport } from '@/hooks/use-viewport';
import { api } from '@/lib/client/api';
import { isOnline } from '@/lib/client/format';
import type { SidebarItem, User } from '@/lib/client/types';
import { CountBadge } from '@/components/ui/count-badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  AppsIcon, AtIcon, BellIcon, ChevronDownIcon, ChevronUpIcon, DraftIcon, HashIcon, LockIcon, PenIcon, PlusIcon, SearchIcon, ThreadsIcon,
} from '@/components/ui/icons';
import { DndButton } from './rail';

export function Sidebar() {
  const { mobile, tablet, desktop } = useViewport();
  const { data: ws } = useWorkspace();
  const query = useUi((s) => s.query);
  const set = useUi((s) => s.set);

  return (
    <aside
      className="flex min-h-0 max-w-full min-w-[250px] flex-col overflow-hidden border-r border-line"
      style={{ width: mobile ? '100%' : tablet ? 300 : 325, flex: mobile ? '1 1 auto' : tablet ? '0 0 300px' : '0 1 325px' }}
    >
      <div className="flex h-14 flex-none items-center justify-between border-b border-line pr-3 pl-4">
        <div
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            set({ ctx: { section: 'ws', x: r.left, y: r.bottom + 6 } });
          }}
          className="-ml-1.5 flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-lg font-black hover:bg-hover"
        >
          <span className="truncate">{ws?.name ?? ''}</span>
          <ChevronDownIcon size={14} className="flex-none text-mute" />
        </div>
        <div className="flex flex-none gap-1.5">
          {!desktop && <DndButton size={32} />}
          {!desktop && <ThemeToggle compact />}
          <button
            onClick={() => set({ modal: 'dm' })}
            title="New message"
            className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-line bg-bg text-txt outline-none hover:bg-hover"
          >
            <PenIcon size={15} />
          </button>
        </div>
      </div>

      <div className="px-3 pt-3 pb-1">
        <div className="flex h-[34px] items-center gap-2 rounded-md border border-line px-2.5">
          <SearchIcon size={14} className="flex-none text-mute" />
          <input
            value={query}
            onChange={(e) => set({ query: e.target.value, mobilePane: e.target.value ? 'chat' : useUi.getState().mobilePane })}
            onKeyDown={(e) => e.key === 'Escape' && set({ query: '' })}
            placeholder="Search people, channels, messages"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-txt outline-none placeholder:text-mute"
          />
          <span className="rounded border border-line px-[5px] py-px font-mono text-[11px] text-mute">⌘K</span>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 auto-rows-max grid-cols-[minmax(0,1fr)] content-start gap-0.5 overflow-x-hidden overflow-y-auto px-2 pt-2 pb-4">
        <NavItems />
        <Channels />
        <DirectMessages />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mentions · Threads · Drafts · Activity · Apps
// ---------------------------------------------------------------------------
const NAV: { view: Exclude<View, null | 'app'>; label: string; icon: ReactNode; bg: string }[] = [
  { view: 'mentions', label: 'Mentions', icon: <AtIcon size={17} className="text-[#4aa8ff]" />, bg: 'rgba(0,144,255,.16)' },
  { view: 'threads', label: 'Threads', icon: <ThreadsIcon size={17} className="text-[#b783f0]" />, bg: 'rgba(142,78,198,.2)' },
  { view: 'drafts', label: 'Drafts', icon: <DraftIcon size={17} className="text-[#ff9a52]" />, bg: 'rgba(247,107,21,.18)' },
  { view: 'activity', label: 'Activity', icon: <BellIcon size={17} className="text-[#4cc38a]" />, bg: 'rgba(48,164,108,.18)' },
  { view: 'apps', label: 'Apps, agents & bots', icon: <AppsIcon size={17} className="text-accent-icon" />, bg: 'rgba(124,58,237,.18)' },
];

function NavItems() {
  const view = useUi((s) => s.view);
  const conversationId = useUi((s) => s.conversationId);
  const { data: sidebar } = useSidebar();
  const { data: mentions } = useFeed('mentions');
  const { data: drafts } = useDrafts();
  const { data: apps } = useApps();

  // Mentions still unread in their conversation.
  const unreadMentions = useMemo(() => {
    if (!mentions || !sidebar) return 0;
    const lastRead = new Map([...sidebar.channels, ...sidebar.direct_messages].map((c) => [c.id, c.last_read_message_id ?? 0]));
    return mentions.filter((m) => m.conversation && m.conversation.id !== conversationId && m.message_id > (lastRead.get(m.conversation.id) ?? 0)).length;
  }, [mentions, sidebar, conversationId]);

  const counts: Partial<Record<string, number>> = { mentions: unreadMentions, drafts: drafts?.length ?? 0, apps: apps?.length ?? 0 };

  return NAV.map((n) => {
    const active = view === n.view || (n.view === 'apps' && view === 'app');
    const count = counts[n.view] ?? 0;
    return (
      <div
        key={n.view}
        onClick={() => useUi.getState().openView(n.view)}
        className={`flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-base font-bold text-txt2 ${active ? 'bg-line' : 'hover:bg-hover'}`}
      >
        <span className="flex size-7 flex-none items-center justify-center rounded-lg" style={{ background: n.bg }}>{n.icon}</span>
        <span className="min-w-0 flex-1 truncate">{n.label}</span>
        {(count > 0 || n.view === 'apps') && <CountBadge n={count} />}
      </div>
    );
  });
}

// ---------------------------------------------------------------------------
// Section header (Channels / Direct messages)
// ---------------------------------------------------------------------------
function SectionHeader({ section, label, onAdd, addTitle }: { section: Section; label: string; onAdd: () => void; addTitle: string }) {
  const collapsed = useUi((s) => !!s.collapsed[section]);
  const unreadOnly = useUi((s) => s.unreadOnly[section]);
  const set = useUi((s) => s.set);
  const [hover, setHover] = useState(false);

  const toggleUnread = (e: React.MouseEvent) => {
    e.stopPropagation();
    const s = useUi.getState();
    set({ unreadOnly: { ...s.unreadOnly, [section]: !unreadOnly }, collapsed: { ...s.collapsed, [section]: false } });
  };

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        set({ ctx: { section, x: Math.min(e.clientX, window.innerWidth - 500), y: Math.min(e.clientY, window.innerHeight - 240) } });
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center justify-between rounded-md pt-[18px] pr-1 pb-1.5 pl-2 text-[15px] font-bold text-mute"
    >
      <span
        onClick={() => set({ collapsed: { ...useUi.getState().collapsed, [section]: !collapsed } })}
        className="-ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 whitespace-nowrap hover:text-txt"
      >
        <ChevronDownIcon size={12} strokeWidth={2.6} className="flex-none transition-transform duration-150" style={{ transform: `rotate(${collapsed ? -90 : 0}deg)` }} />
        <span className="min-w-0 flex-[0_1_auto] truncate">{label}</span>
        {unreadOnly ? (
          <span onClick={toggleUnread} title="Show all conversations"
            className="ml-0.5 flex-none cursor-pointer rounded-full border border-accent/50 px-[7px] py-px text-[11px] font-bold whitespace-nowrap text-accent-icon hover:bg-accent/18">
            Unreads
          </span>
        ) : hover ? (
          <span onClick={toggleUnread}
            className="ml-0.5 flex-none cursor-pointer rounded-full bg-online px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-white hover:bg-[#24965f]">
            Show unreads
          </span>
        ) : null}
      </span>
      <span onClick={onAdd} title={addTitle} className="flex size-6 flex-none cursor-pointer items-center justify-center rounded-md hover:bg-line hover:text-txt">
        <PlusIcon size={16} />
      </span>
    </div>
  );
}

function Pager({ section, rest, canLess }: { section: Section; rest: number; canLess: boolean }) {
  const set = useUi((s) => s.set);
  const limit = useUi((s) => s.listLimit[section]);
  const setLimit = (n: number) => set({ listLimit: { ...useUi.getState().listLimit, [section]: n } });
  if (rest > 0) {
    return (
      <div onClick={() => setLimit(limit + PAGE)} className="flex h-[34px] cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-[15px] text-mute hover:bg-hover hover:text-txt">
        <span className="flex size-[22px] flex-none items-center justify-center"><ChevronDownIcon size={16} strokeWidth={2.2} /></span>
        <span>Show {Math.min(PAGE, rest)} more</span>
      </div>
    );
  }
  if (!canLess) return null;
  return (
    <div onClick={() => setLimit(PAGE)} className="flex h-[34px] cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-[15px] text-mute hover:bg-hover hover:text-txt">
      <span className="flex size-[22px] flex-none items-center justify-center"><ChevronUpIcon size={16} strokeWidth={2.2} /></span>
      <span>Show less</span>
    </div>
  );
}

/** Applies search, unread-only and paging (the selected row always stays visible). */
function useSectionRows<T extends { id: string; unread: number }>(section: Section, items: T[], match: (x: T) => boolean) {
  const q = useUi((s) => s.query.trim());
  const unreadOnly = useUi((s) => s.unreadOnly[section]);
  const limit = useUi((s) => s.listLimit[section]);
  const selected = useUi((s) => (s.view ? null : s.conversationId));
  const rows = items.filter((x) => (!q || match(x)) && (!unreadOnly || x.unread > 0 || x.id === selected));
  const L = q ? Infinity : limit;
  const shown = rows.slice(0, L);
  const hiddenSelected = rows.slice(L).find((x) => x.id === selected);
  if (hiddenSelected) shown.push(hiddenSelected);
  return { shown, rest: Math.max(0, rows.length - L), canLess: !q && rows.length <= L && L > PAGE && rows.length > PAGE };
}

function Row({ selected, unread, onClick, onContextMenu, icon, children, trailing, wide }: {
  selected: boolean; unread: number; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void;
  icon: ReactNode; children: ReactNode; trailing?: ReactNode; wide?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex h-9 cursor-pointer items-center ${wide ? 'gap-2.5' : 'gap-2'} rounded-md px-1.5 text-base ${selected ? 'bg-line text-txt' : 'text-txt3 hover:bg-hover'}`}
      style={{ fontWeight: unread ? 600 : 400 }}
    >
      {icon}
      {children}
      {trailing}
      {unread > 0 && <CountBadge n={unread} tone="unread" />}
    </div>
  );
}

const open = (c: SidebarItem) => useUi.getState().openConversation(c.id, c.last_read_message_id);

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
function Channels() {
  const { data } = useSidebar();
  const collapsed = useUi((s) => !!s.collapsed.channels);
  const selected = useUi((s) => (s.view ? null : s.conversationId));
  const q = useUi((s) => s.query.trim().toLowerCase());
  const channels = useMemo(
    () => [...(data?.channels ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((c) => ({ ...c, unread: c.id === selected ? 0 : c.unread })),
    [data, selected],
  );
  const { shown, rest, canLess } = useSectionRows('channels', channels, (c) => (c.name ?? '').includes(q));

  return (
    <>
      <SectionHeader section="channels" label="Channels" addTitle="Create a channel" onAdd={() => useUi.getState().set({ modal: 'channel' })} />
      {!collapsed && (
        <>
          {shown.map((c) => (
            <Row
              key={c.id}
              selected={c.id === selected}
              unread={c.unread}
              onClick={() => open(c)}
              onContextMenu={(e) => {
                e.preventDefault();
                useUi.getState().set({
                  ctx: { section: 'channel', conversationId: c.id, x: Math.min(e.clientX, window.innerWidth - 270), y: Math.min(e.clientY, window.innerHeight - 220) },
                });
              }}
              icon={
                <span className="flex size-[22px] flex-none items-center justify-center opacity-80">
                  {c.kind === 'private_channel' ? <LockIcon size={17} strokeWidth={2.2} /> : <HashIcon size={18} />}
                </span>
              }
            >
              <span className="flex-1 truncate">{c.name}</span>
            </Row>
          ))}
          <Pager section="channels" rest={rest} canLess={canLess} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Direct messages (+ pending invitations for admins)
// ---------------------------------------------------------------------------
function DirectMessages() {
  const { data } = useSidebar();
  const { data: me } = useMe();
  const { data: ws } = useWorkspace();
  const { byId } = useMembers();
  const collapsed = useUi((s) => !!s.collapsed.dms);
  const sortAZ = useUi((s) => s.sortAZ);
  const selected = useUi((s) => (s.view ? null : s.conversationId));
  const q = useUi((s) => s.query.trim().toLowerCase());
  const isAdmin = ws?.role === 'owner' || ws?.role === 'admin';
  const { data: invites, mutate: mutateInvites } = useInvitations(isAdmin);
  const [resent, setResent] = useState<Record<string, boolean>>({});

  const dms = useMemo(() => {
    const rows = (data?.direct_messages ?? []).map((d) => {
      const others = (d.other_user_ids ?? []).map((id) => byId.get(id)?.user).filter((u): u is User => !!u);
      const name = d.kind === 'dm' ? others[0]?.display_name ?? (d.other_user_ids?.length ? 'Unknown' : `${me?.display_name ?? ''} (you)`) : others.map((u) => u.display_name).join(', ');
      return { ...d, others, label: name, unread: d.id === selected ? 0 : d.unread };
    });
    return rows.sort((a, b) =>
      sortAZ ? a.label.localeCompare(b.label) : (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''),
    );
  }, [data, byId, me, selected, sortAZ]);
  const { shown, rest, canLess } = useSectionRows('dms', dms, (d) => d.label.toLowerCase().includes(q));
  const pending = (invites ?? []).filter((i) => !q || i.email.includes(q));

  const resend = async (e: React.MouseEvent, email: string, role: string) => {
    e.stopPropagation();
    const wsId = useUi.getState().workspaceId;
    await api('POST', `/api/workspaces/${wsId}/invitations`, { email, role }).catch(() => {});
    setResent((r) => ({ ...r, [email]: true }));
    mutateInvites();
  };

  return (
    <>
      <SectionHeader section="dms" label="Direct messages" addTitle="New direct message" onAdd={() => useUi.getState().set({ modal: 'dm' })} />
      {!collapsed && (
        <>
          {shown.map((d) => {
            const u = d.others[0];
            const isGroup = d.kind === 'group_dm';
            return (
              <Row
                key={d.id}
                wide
                selected={d.id === selected}
                unread={d.unread}
                onClick={() => open(d)}
                icon={
                  <span className="flex size-[22px] flex-none items-center justify-center">
                    {isGroup ? (
                      <span className="flex size-[17px] items-center justify-center rounded bg-txt3 text-[11px] font-black text-bg">{d.member_count}</span>
                    ) : isOnline(u ?? me ?? null) ? (
                      <span className="size-[11px] rounded-full bg-online" />
                    ) : (
                      <span className="size-[11px] rounded-full border-2 border-current opacity-75" />
                    )}
                  </span>
                }
                trailing={
                  <>
                    {!isGroup && u?.status_emoji && <span title={u.status_text ?? ''} className="text-base leading-none">{u.status_emoji}</span>}
                    <span className="flex-1" />
                  </>
                }
              >
                <span className="min-w-0 flex-[0_1_auto] truncate">{d.label}</span>
              </Row>
            );
          })}
          {pending.map((i) => (
            <div key={i.id} className="flex h-9 items-center gap-2.5 rounded-md px-1.5 text-base text-txt3 hover:bg-hover">
              <span className="flex size-[22px] flex-none items-center justify-center">
                <span className="size-[11px] rounded-[3px] border-2 border-current opacity-75" />
              </span>
              <span className="min-w-0 flex-[0_1_auto] truncate">{i.email}</span>
              <span onClick={(e) => resend(e, i.email, i.role)} className="cursor-pointer font-normal text-mute hover:text-txt hover:underline">
                {resent[i.email] ? 'Sent' : 'Resend'}
              </span>
              <span className="flex-1" />
            </div>
          ))}
          <Pager section="dms" rest={rest} canLess={canLess} />
          <div
            onClick={() => useUi.getState().set({ settings: 'members' })}
            className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-base font-black text-txt hover:bg-hover"
          >
            <span className="flex size-[22px] flex-none items-center justify-center"><PlusIcon size={16} strokeWidth={2.6} /></span>
            <span>Invite people</span>
          </div>
        </>
      )}
    </>
  );
}
