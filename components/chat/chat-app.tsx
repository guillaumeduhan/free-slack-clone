'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SWRConfig } from 'swr';
import { api, ApiError } from '@/lib/client/api';
import { useUi } from '@/hooks/use-ui';
import { useMe, useRealtime, useSidebar, useWorkspaces } from '@/hooks/use-chat-data';
import { useViewport } from '@/hooks/use-viewport';
import { Rail } from './rail';
import { Sidebar } from './sidebar';
import { ChannelView } from './channel-view';
import { FeedView } from './feed-view';
import { AppsList, AppDetail, AddAppDialog } from './apps-view';
import { ThreadPanel } from './thread-panel';
import { ContextMenu, HoverCardPopup, Lightbox, DeleteDialog, ReactionPicker } from './overlays';
import { ChannelDialog, DmDialog, WorkspaceDialog, ProfileDialog, BrowseDialog } from './dialogs';
import { MembersDialog } from './members-dialog';
import { SettingsDialog } from './settings-dialog';

const WS_KEY = 'teamchat-workspace';
const CONV_KEY = 'teamchat-conversation';

export function ChatApp() {
  const router = useRouter();
  return (
    <SWRConfig
      value={{
        onError: (e) => {
          // Session expired or access removed → back to sign-in.
          if (e instanceof ApiError && (e.status === 401 || e.code === 'no_access')) router.replace('/login');
        },
      }}
    >
      <Shell />
    </SWRConfig>
  );
}

function Shell() {
  const { data: me } = useMe();
  const { data: workspaces } = useWorkspaces();
  const { data: sidebar } = useSidebar();
  const ui = useUi();
  const { mobile, desktop } = useViewport();
  useRealtime();

  // New accounts default to UTC: adopt the browser's timezone for "local time".
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (me && me.timezone === 'UTC' && tz && tz !== 'UTC') api('PATCH', '/api/me', { timezone: tz }).catch(() => {});
  }, [me]);

  // Pick the workspace (last used, else first).
  useEffect(() => {
    if (!workspaces?.length || (ui.workspaceId && workspaces.some((w) => w.id === ui.workspaceId))) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(WS_KEY); } catch { /* storage blocked */ }
    ui.set({ workspaceId: workspaces.find((w) => w.id === saved)?.id ?? workspaces[0].id, conversationId: null });
  }, [workspaces, ui]);

  useEffect(() => {
    if (!ui.workspaceId) return;
    try { localStorage.setItem(WS_KEY, ui.workspaceId); } catch { /* storage blocked */ }
  }, [ui.workspaceId]);

  // Pick the conversation (last opened, else #general, else first).
  useEffect(() => {
    if (!sidebar) return;
    const all = [...sidebar.channels, ...sidebar.direct_messages];
    if (ui.conversationId && all.some((c) => c.id === ui.conversationId)) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(CONV_KEY); } catch { /* storage blocked */ }
    const pick = all.find((c) => c.id === saved) ?? sidebar.channels.find((c) => c.name === 'general') ?? all[0];
    if (pick) {
      ui.openConversation(pick.id, pick.last_read_message_id);
      if (mobile) ui.set({ mobilePane: 'list' });
    }
  }, [sidebar, ui, mobile]);

  useEffect(() => {
    if (!ui.conversationId) return;
    try { localStorage.setItem(CONV_KEY, ui.conversationId); } catch { /* storage blocked */ }
  }, [ui.conversationId]);

  if (!me || !ui.workspaceId) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <span className="size-7 animate-spin rounded-full border-[3px] border-line3 border-t-accent" />
      </div>
    );
  }

  const showSidebar = !mobile || ui.mobilePane === 'list';
  const showMain = !mobile || ui.mobilePane === 'chat';
  const inFeed = ui.view === 'mentions' || ui.view === 'threads' || ui.view === 'drafts' || ui.view === 'activity' || !!ui.query.trim();

  return (
    <div className="relative flex h-screen w-full overflow-hidden text-sm">
      {desktop && <Rail />}
      {showSidebar && <Sidebar />}
      {showMain && (
        <main className="flex min-h-0 flex-[1_1_360px] flex-col" style={{ minWidth: mobile ? 0 : 320 }}>
          {inFeed ? <FeedView /> : ui.view === 'apps' ? <AppsList /> : ui.view === 'app' ? <AppDetail /> : <ChannelView />}
        </main>
      )}
      {ui.threadId != null && !inFeed && !ui.view && <ThreadPanel />}

      <ChannelDialog />
      <DmDialog />
      <WorkspaceDialog />
      <ProfileDialog />
      <BrowseDialog />
      <MembersDialog />
      <SettingsDialog />
      <AddAppDialog />
      <DeleteDialog />
      <ReactionPicker />
      <ContextMenu />
      <HoverCardPopup />
      <Lightbox />
    </div>
  );
}
