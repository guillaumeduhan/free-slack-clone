/** Shapes returned by the API (see README endpoints). */
export type Role = 'owner' | 'admin' | 'member';
export type ConversationKind = 'public_channel' | 'private_channel' | 'dm' | 'group_dm';

export type User = {
  id: string; email: string | null; display_name: string; title: string | null; avatar_url: string | null;
  timezone: string; status_text: string | null; status_emoji: string | null; is_bot: boolean; last_seen_at: string | null;
};

export type Member = { role: Role; joined_at: string; user: User };

export type Me = User & { workspaces: { role: Role; workspace: { id: string; name: string; slug: string; logo_url: string | null } }[] };

export type Workspace = {
  id: string; name: string; slug: string; description: string | null; logo_url: string | null; created_at: string; role: Role;
};

export type SidebarItem = {
  id: string; kind: ConversationKind; name: string | null; topic: string | null; description: string | null;
  unread: number; muted: boolean; starred: boolean; last_message_at: string | null; last_message_id: number | null;
  last_read_message_id: number | null; member_count: number; other_user_ids: string[] | null;
};

export type Sidebar = { channels: SidebarItem[]; direct_messages: SidebarItem[] };

export type Reaction = { emoji: string; count: number; mine: boolean; user_ids: string[] };
export type FileInfo = {
  id: string; name: string; mime_type: string; size_bytes: number; width: number | null; height: number | null;
  duration_ms: number | null; url: string;
};

export type Message = {
  id: number; conversation_id: string; parent_id: number | null; user_id: string; body: string;
  reply_count: number; last_reply_at: string | null; also_sent_to_channel: boolean;
  edited_at: string | null; deleted_at: string | null; created_at: string; saved: boolean;
  author: { id: string; display_name: string; avatar_url: string | null; is_bot: boolean };
  reply_users: string[]; reactions: Reaction[]; files: FileInfo[];
};

export type Conversation = {
  id: string; workspace_id: string; kind: ConversationKind; name: string | null; topic: string | null;
  description: string | null; archived_at: string | null; created_at: string; member_count: number;
  membership: { last_read_message_id: number | null; muted: boolean; starred: boolean; notify_level: string | null } | null;
};

export type FeedItem = {
  item: 'mention' | 'thread' | 'reaction' | 'saved'; message_id: number; parent_id: number | null; body: string;
  emoji: string | null; created_at: string;
  actor: { id: string; display_name: string; avatar_url: string | null; is_bot: boolean } | null;
  conversation: { id: string; kind: ConversationKind; name: string | null } | null;
};

export type Draft = {
  id: string; body: string; parent_id: number | null; updated_at: string;
  conversation: { id: string; kind: ConversationKind; name: string | null; workspace_id: string };
};

export type Preferences = {
  theme: 'dark' | 'light'; notify_level: 'all' | 'mentions' | 'none'; desktop_enabled: boolean; sound_enabled: boolean;
  email_digest: boolean; dnd_enabled: boolean; dnd_start: string | null; dnd_end: string | null;
};

export type AppKind = 'app' | 'agent' | 'bot';
export type AppSummary = {
  id: string; kind: AppKind; name: string; description: string | null; created_at: string;
  bot: { id: string; display_name: string; avatar_url: string | null };
  default_conversation: { id: string; name: string } | null;
};
export type AppDetail = AppSummary & {
  bot_user_id: string; default_conversation_id: string | null; created_by: string | null;
  tokens: { id: string; token_prefix: string; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string }[];
  webhooks: { id: string; conversation_id: string; created_at: string; disabled_at: string | null }[];
  recent: { id: number; body: string; created_at: string; conversation_id: string; conversation_name: string | null }[];
};

export type Invitation = { id: string; email: string; role: Role; status: string; invited_by: string | null; created_at: string; expires_at: string };

export type SearchResult = {
  people: { id: string; display_name: string; title: string | null; avatar_url: string | null; is_bot: boolean }[];
  channels: { id: string; kind: ConversationKind; name: string; topic: string | null }[];
  messages: Message[];
};
