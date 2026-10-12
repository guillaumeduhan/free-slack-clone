-- =====================================================================
-- Team Chat · PostgreSQL 15+ setup
-- Creates the "chat" schema with all types, tables, relations,
-- indexes and triggers. Safe to re-run: every object is guarded.
--
-- Usage:  psql "$DATABASE_URL" -f schema.sql
-- Reset:  DROP SCHEMA IF EXISTS chat CASCADE;  (then re-run)
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS chat;
SET LOCAL search_path TO chat, public;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'chat' AND t.typname = 'member_role') THEN
    CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'chat' AND t.typname = 'invite_status') THEN
    CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'chat' AND t.typname = 'conversation_kind') THEN
    CREATE TYPE conversation_kind AS ENUM ('public_channel', 'private_channel', 'dm', 'group_dm');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'chat' AND t.typname = 'notify_level') THEN
    CREATE TYPE notify_level AS ENUM ('all', 'mentions', 'none');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'chat' AND t.typname = 'mention_kind') THEN
    CREATE TYPE mention_kind AS ENUM ('user', 'channel', 'here');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'chat' AND t.typname = 'app_kind') THEN
    CREATE TYPE app_kind AS ENUM ('app', 'agent', 'bot');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'chat' AND t.typname = 'theme_mode') THEN
    CREATE TYPE theme_mode AS ENUM ('dark', 'light');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Workspace & people
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  slug                     citext NOT NULL UNIQUE,
  description              text,
  logo_url                 text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    citext UNIQUE,
  display_name             text NOT NULL,
  title                    text,
  avatar_url               text,
  timezone                 text NOT NULL DEFAULT 'UTC',
  status_text              text,
  status_emoji             text,
  is_bot                   boolean NOT NULL DEFAULT false,
  last_seen_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (is_bot OR email IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id             uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role                     member_role NOT NULL DEFAULT 'member',
  joined_at                timestamptz NOT NULL DEFAULT now(),
  deactivated_at           timestamptz,
  PRIMARY KEY (workspace_id, user_id)
);
-- Exactly one owner per workspace; admins and members are unlimited.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_one_owner
  ON workspace_members (workspace_id) WHERE role = 'owner';
CREATE INDEX IF NOT EXISTS workspace_members_user ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  email                    citext NOT NULL,
  role                     member_role NOT NULL DEFAULT 'member' CHECK (role <> 'owner'),
  invited_by               uuid REFERENCES users (id) ON DELETE SET NULL,
  token_hash               text NOT NULL UNIQUE,
  status                   invite_status NOT NULL DEFAULT 'pending',
  created_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_one_pending
  ON invitations (workspace_id, email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id             uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  theme                    theme_mode NOT NULL DEFAULT 'dark',
  notify_level             notify_level NOT NULL DEFAULT 'mentions',
  desktop_enabled          boolean NOT NULL DEFAULT true,
  sound_enabled            boolean NOT NULL DEFAULT true,
  email_digest             boolean NOT NULL DEFAULT false,
  dnd_enabled              boolean NOT NULL DEFAULT false,
  dnd_start                time,
  dnd_end                  time,
  PRIMARY KEY (user_id, workspace_id)
);

-- ---------------------------------------------------------------------
-- Conversations (channels, private channels, DMs, group DMs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  kind                     conversation_kind NOT NULL,
  name                     citext,
  topic                    text,
  description              text,
  created_by               uuid REFERENCES users (id) ON DELETE SET NULL,
  archived_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('public_channel', 'private_channel')) = (name IS NOT NULL)),
  CHECK (name IS NULL OR name ~ '^[a-z0-9_-]{1,80}$'),
  UNIQUE (workspace_id, name)
);

-- ---------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id          uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users (id),
  parent_id                bigint REFERENCES messages (id) ON DELETE CASCADE,
  body                     text NOT NULL DEFAULT '',
  reply_count              integer NOT NULL DEFAULT 0,
  last_reply_at            timestamptz,
  also_sent_to_channel     boolean NOT NULL DEFAULT false,
  edited_at                timestamptz,
  deleted_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (also_sent_to_channel = false OR parent_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS messages_timeline
  ON messages (conversation_id, created_at DESC) WHERE parent_id IS NULL OR also_sent_to_channel;
CREATE INDEX IF NOT EXISTS messages_thread
  ON messages (parent_id, created_at) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_user ON messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_search
  ON messages USING gin (to_tsvector('simple', body));

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id          uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_message_id     bigint REFERENCES messages (id) ON DELETE SET NULL,
  muted                    boolean NOT NULL DEFAULT false,
  notify_level             notify_level,
  starred                  boolean NOT NULL DEFAULT false,
  joined_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user ON conversation_members (user_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id               bigint NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji                    text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS mentions (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id               bigint NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id                  uuid REFERENCES users (id) ON DELETE CASCADE,
  kind                     mention_kind NOT NULL,
  CHECK ((kind = 'user') = (user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mentions_user ON mentions (user_id, message_id DESC);
CREATE INDEX IF NOT EXISTS mentions_message ON mentions (message_id);

CREATE TABLE IF NOT EXISTS drafts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  conversation_id          uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  parent_id                bigint REFERENCES messages (id) ON DELETE CASCADE,
  body                     text NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, conversation_id, parent_id)
);

CREATE TABLE IF NOT EXISTS saved_items (
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message_id               bigint NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

-- ---------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  uploader_id              uuid REFERENCES users (id) ON DELETE SET NULL,
  name                     text NOT NULL,
  mime_type                text NOT NULL,
  size_bytes               bigint NOT NULL CHECK (size_bytes >= 0),
  storage_key              text NOT NULL UNIQUE,
  width                    integer,
  height                   integer,
  duration_ms              integer,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_files (
  message_id               bigint NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  file_id                  uuid NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  position                 smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (message_id, file_id)
);

-- ---------------------------------------------------------------------
-- Apps, agents & bots
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS apps (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  bot_user_id              uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  kind                     app_kind NOT NULL DEFAULT 'app',
  name                     text NOT NULL,
  description              text,
  default_conversation_id  uuid REFERENCES conversations (id) ON DELETE SET NULL,
  created_by               uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_tokens (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                   uuid NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  token_prefix             text NOT NULL,
  token_hash               text NOT NULL UNIQUE,
  scopes                   text[] NOT NULL DEFAULT '{chat:write}',
  last_used_at             timestamptz,
  revoked_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhooks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                   uuid NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  conversation_id          uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  secret_hash              text NOT NULL UNIQUE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  disabled_at              timestamptz
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
-- Keep messages.reply_count / last_reply_at in sync with thread replies.
CREATE OR REPLACE FUNCTION chat.sync_reply_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE chat.messages
       SET reply_count = reply_count + 1, last_reply_at = NEW.created_at
     WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE chat.messages
       SET reply_count = GREATEST(reply_count - 1, 0)
     WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS messages_reply_count ON messages;
CREATE TRIGGER messages_reply_count
  AFTER INSERT OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION chat.sync_reply_count();

-- Touch drafts.updated_at on every edit.
CREATE OR REPLACE FUNCTION chat.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS drafts_touch ON drafts;
CREATE TRIGGER drafts_touch
  BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION chat.touch_updated_at();

-- ---------------------------------------------------------------------
-- Handy view: unread count per member and conversation
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW unread_counts AS
SELECT cm.user_id,
       cm.conversation_id,
       count(m.id) AS unread
  FROM conversation_members cm
  LEFT JOIN messages m
         ON m.conversation_id = cm.conversation_id
        AND (m.parent_id IS NULL OR m.also_sent_to_channel)
        AND m.deleted_at IS NULL
        AND m.user_id <> cm.user_id
        AND m.id > COALESCE(cm.last_read_message_id, 0)
 GROUP BY cm.user_id, cm.conversation_id;

COMMIT;
