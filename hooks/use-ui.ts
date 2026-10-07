'use client';

import { create } from 'zustand';

/**
 * Client UI state for the chat screen (what is open, selected, hovered).
 * Server data lives in SWR (hooks/use-chat-data.ts), never here.
 */

export type View = 'mentions' | 'threads' | 'drafts' | 'activity' | 'apps' | 'app' | null;
export type Modal = 'channel' | 'dm' | 'workspace' | 'profile' | 'browse' | 'forward' | null;
export type SettingsTab = 'general' | 'members' | 'notifications' | null;
export type Section = 'channels' | 'dms';

export type CtxMenu =
  | { section: 'msg'; messageId: number; conversationId: string; x: number; y: number }
  | { section: 'channel'; conversationId: string; x: number; y: number }
  | { section: 'ws' | 'channels' | 'dms'; x: number; y: number };

export type HoverCard = { userId: string; left: number; top: number };
export type Lightbox = { files: { name: string; url: string; size_bytes: number }[]; index: number; authorId: string; createdAt: string };
export type Picker = { key: string; top: number; left: number; onPick: (emoji: string) => void };

type UiState = {
  workspaceId: string | null;
  conversationId: string | null;
  view: View;
  appId: string | null;
  threadId: number | null;
  query: string;
  modal: Modal;
  profileId: string | null;
  forwardText: string | null;
  settings: SettingsTab;
  membersOf: string | null;
  addAppOpen: boolean;
  ctx: CtxMenu | null;
  hoverCard: HoverCard | null;
  lightbox: Lightbox | null;
  deleteTarget: number | null;
  /** Channel waiting for delete confirmation. */
  deleteChannel: string | null;
  picker: Picker | null;
  mobilePane: 'list' | 'chat';
  collapsed: Record<string, boolean>;
  unreadOnly: Record<Section, boolean>;
  sortAZ: boolean;
  listLimit: Record<Section, number>;
  /** Read marker when a conversation was opened, for the "New" divider. */
  seenUpTo: Record<string, number | null>;
  /** Apps secrets are only returned once by the API; keep them for this session. */
  appSecrets: Record<string, { token?: string; webhookUrl?: string }>;

  set: (patch: Partial<UiState>) => void;
  openConversation: (id: string, lastRead?: number | null) => void;
  openView: (view: View) => void;
  openProfile: (userId: string) => void;
  closeOverlays: () => void;
};

export const PAGE = 10;

export const useUi = create<UiState>((set) => ({
  workspaceId: null,
  conversationId: null,
  view: null,
  appId: null,
  threadId: null,
  query: '',
  modal: null,
  profileId: null,
  forwardText: null,
  settings: null,
  membersOf: null,
  addAppOpen: false,
  ctx: null,
  hoverCard: null,
  lightbox: null,
  deleteTarget: null,
  deleteChannel: null,
  picker: null,
  mobilePane: 'list',
  collapsed: {},
  unreadOnly: { channels: false, dms: false },
  sortAZ: false,
  listLimit: { channels: PAGE, dms: PAGE },
  seenUpTo: {},
  appSecrets: {},

  set: (patch) => set(patch),
  openConversation: (id, lastRead) =>
    set((s) => ({
      conversationId: id,
      view: null,
      threadId: null,
      query: '',
      mobilePane: 'chat',
      seenUpTo: id in s.seenUpTo && s.conversationId === id ? s.seenUpTo : { ...s.seenUpTo, [id]: lastRead ?? null },
    })),
  openView: (view) => set({ view, threadId: null, mobilePane: 'chat' }),
  openProfile: (userId) => set({ modal: 'profile', profileId: userId, hoverCard: null }),
  closeOverlays: () => set({ ctx: null, picker: null, hoverCard: null }),
}));
