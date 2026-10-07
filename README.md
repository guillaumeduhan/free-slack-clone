# Team Chat API · Next.js 16 + PostgreSQL

Route handlers for every action in the Team Chat prototype. The only dependency is a PostgreSQL 15+ connection pool (`DATABASE_URL`): no Supabase, no storage bucket, no external auth.

- **Business rules live in Postgres:** row-level security and SQL functions in `db/migrations/` enforce them. Everything lives in the `chat` schema.
- **Handlers stay thin:** they validate input with zod, run SQL as the signed-in user, and shape the JSON.

## Quick start

```bash
cp .env.example .env.local     # set DATABASE_URL and OWNER_EMAIL
npm install
npm run db:reset               # drop + migrate + seed (Northwind, demo teammates, owner invite)
npm run dev                    # http://localhost:3002
npm run smoke                  # end-to-end check of every endpoint (needs the dev server)
```

Or from the repo root: `make setup` then `make dev`.

To sign in:
1. `POST /api/auth/otp { email }` with `OWNER_EMAIL` (or a demo teammate such as `marc@northwind.test`).
2. The 6-digit code is printed in the server log, and returned as `dev_code` outside production.
3. `POST /api/auth/verify { email, token }`. The first sign-in makes `OWNER_EMAIL` the owner of Northwind.

## UI

- `/login` is ported from `Login.dc.html` and `/` from `Team Chat.dc.html` (the Claude Design files at the repo root, left untouched).
- `components/chat/*`: one file per area (rail, sidebar, channel view, message, composer, thread, dialogs, settings, feeds, apps, overlays).
- `hooks/use-chat-data.ts` fetches API data with SWR and revalidates it from the SSE stream. `hooks/use-ui.ts` (zustand) holds what's open or selected.
- Design tokens are CSS variables in `app/globals.css`, exposed as Tailwind colors, in dark and light.

## How it works without Supabase

| Supabase piece | Replacement |
|---|---|
| `auth.uid()` + JWT | `chat.uid()` reads `chat.uid`, set per transaction. Each request runs `set local role chat_user` so RLS applies (`lib/db.ts` `asUser`) |
| `service_role` client | `asServer`: the pool's login role, which owns the tables and bypasses RLS. Used for auth, bot API, webhooks |
| Supabase Auth (email OTP) | `chat.sign_in_codes` (hashed, 10 min, 5 attempts) and `chat.sessions` (hashed opaque tokens, 30 days) |
| Storage bucket | `chat.file_blobs` (bytea, 50 MB max), served by `/api/files/:id/content` |
| Realtime | `pg_notify('chat', …)` triggers, one shared `LISTEN chat` connection, SSE per workspace |

## Layout

```
lib/
  db.ts         pool · asUser (RLS) · asServer · many/maybe/exec helpers
  http.ts       route() wrapper, ok(), body()/query() zod parsing, Postgres → HTTP errors
  auth.ts       sessions · requireUser · requireRole · requireConversation
  messages.ts   MESSAGE_JSON (one SQL json object per message), reaction summaries
  realtime.ts   LISTEN/NOTIFY hub
proxy.ts        fast session gate (Next 16 replacement for middleware.ts)
app/api/…       one route.ts per resource (below)
db/migrations/
  0000_roles.sql                 chat schema, chat_user role, chat.uid()
  0001_schema.sql                tables, enums, indexes, triggers
  0002_rls_and_functions.sql     grants, RLS, SQL functions
  0003_invite_only.sql           is_email_allowed, claim invitations on first sign-in
  0004_realtime_files_sessions.sql  sign-in codes, sessions, file blobs, NOTIFY triggers
db/seed.sql     Northwind workspace, channels, demo teammates and messages, owner invite
scripts/        migrate.mjs (db:migrate / db:seed / db:reset) · smoke.mjs
```

## Conventions

**Responses**
- Success: `{ ok: true, data }`
- Error: `{ ok: false, error: { code, message } }`

**Status codes**
- `401` unauthorized
- `403` forbidden
- `404` not_found
- `409` conflict
- `422` invalid_request / invalid_value

**Auth**
- Browser clients use the `tc_session` cookie (HttpOnly, set by `/api/auth/verify`).
- Native clients send `Authorization: Bearer tcs_…` (the `token` returned by `/api/auth/verify`).
- Bots send `Bearer xoxb-…`, but only to `/api/bot/*`.

**IDs**
- Most rows use uuid keys.
- Messages use a numeric `id`, which also serves as the pagination cursor and the bot `ts`.

## Endpoints

### Workspaces & people

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/workspaces` | me | My workspaces + role |
| POST | `/api/workspaces` | me | Create (I become owner, #general is created) |
| GET · PATCH · DELETE | `/api/workspaces/:id` | member · admin · owner | Read · rename/logo/URL · delete |
| GET | `/api/workspaces/:id/members` | member | Members with roles + counts per role |
| PATCH | `/api/workspaces/:id/members/:userId` | admin | `{ role: "admin" \| "member" }` |
| DELETE | `/api/workspaces/:id/members/:userId` | admin, or `me` to leave | Deactivate (owner can't be removed) |
| POST | `/api/workspaces/:id/transfer-ownership` | owner | `{ user_id }`, old owner becomes admin |
| GET · POST | `/api/workspaces/:id/invitations` | admin | Pending list · invite `{ email, role }` → `invite_url` |
| DELETE | `/api/invitations/:id` | admin | Revoke |
| POST | `/api/invitations/accept` | me | `{ token }` |
| GET · PATCH | `/api/me` | me | Profile, status emoji, timezone |
| GET · PUT | `/api/me/preferences?workspace_id=` | me | Theme, notifications, do not disturb |

### Conversations

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/workspaces/:id/conversations` | member | Sidebar: channels + DMs with `unread` |
| GET | `/api/workspaces/:id/conversations?browse=1` | member | All public channels |
| POST | `/api/workspaces/:id/conversations` | member | Create channel `{ name, private, topic }` |
| POST | `/api/workspaces/:id/dms` | member | Find or open a DM / group DM `{ user_ids }` |
| GET · PATCH | `/api/conversations/:id` | reader · member | Detail + member count · topic/rename/archive |
| GET · POST · DELETE | `/api/conversations/:id/members` | reader · member · self/admin | List · add `{ user_ids }` or `{ join: true }` · leave/remove |
| POST | `/api/conversations/:id/read` | member | `{ message_id }`, moves the read marker |
| PUT · DELETE | `/api/conversations/:id/draft` | me | Save/clear composer text (`parent_id` for threads) |

### Messages

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/conversations/:id/messages?before=&limit=` | reader | Timeline page (+ `next_before`) |
| POST | `/api/conversations/:id/messages` | member* | `{ text, file_ids }` |
| GET · PATCH · DELETE | `/api/messages/:id` | reader · author · author | Read · edit · delete (own only) |
| GET · POST | `/api/messages/:id/replies` | reader · member* | Thread · reply `{ text, also_send_to_channel }` |
| POST · DELETE | `/api/messages/:id/reactions` | reader | `{ emoji }` · `?emoji=` → reaction summary |
| PUT · DELETE | `/api/messages/:id/save` | reader | Save for later |
| GET | `/api/me/feed?workspace_id=&kind=` | member | `mentions` · `threads` · `activity` · `saved` · `drafts` |
| GET | `/api/workspaces/:id/search?q=` | member | People, channels, messages (full-text) |
| POST | `/api/workspaces/:id/files` | member | Register an upload → `upload.url` |
| PUT · GET | `/api/files/:id/content` | uploader · member | Upload the bytes (once) · download |
| GET | `/api/workspaces/:id/events` | member | Server-Sent Events stream of changes |

\* Posting in a public channel joins it automatically.

### Apps, agents & bots

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/workspaces/:id/apps` | member | Installed apps |
| POST | `/api/workspaces/:id/apps` | admin | Create → `token` + `webhook_url` (shown once) |
| GET · PATCH · DELETE | `/api/apps/:id` | member · admin · admin | Detail · edit · remove |
| POST | `/api/apps/:id/tokens` | admin | Rotate token |
| POST | `/api/bot/chat.postMessage` | `Bearer xoxb-…` | `{ channel: "#deploys", text, thread_ts? }` |
| POST | `/api/hooks/:secret` | webhook secret | `{ text }` → posts to the default channel |

## Flows

**Unread & "New" divider**
1. The sidebar's `unread` comes from the `unread_counts` view.
2. When a conversation is open, call `POST /read` with the newest message id.
3. Messages with an id above the old `last_read_message_id` are the "New" ones.

**File upload**

```ts
const { data } = await api.post(`/api/workspaces/${ws}/files`, { name, mime_type, size_bytes });
await fetch(data.upload.url, { method: 'PUT', body: blob });
await api.post(`/api/conversations/${conv}/messages`, { text, file_ids: [data.file.id] });
```

Files are private: `files[].url` requires a session in the file's workspace. Only images, video, audio and PDF render inline; anything else downloads.

**Realtime**

```ts
const es = new EventSource(`/api/workspaces/${ws}/events`);
es.addEventListener('change', (e) => {
  const { table, op, conversation_id, message_id, parent_id } = JSON.parse(e.data);
  // refetch the timeline / thread / sidebar that changed
});
```

Changes on `messages`, `reactions`, `conversation_members` and `conversations` are streamed. Events about conversations the viewer can't read are dropped (checked with RLS).

## Rules enforced in the database

- **Ownership:** exactly one owner per workspace (partial unique index). Ownership only changes through `transfer_ownership`.
- **Channel names:** lowercase-with-hyphens, unique per workspace.
- **Deleting messages:** you can only delete your own. The message is soft-deleted so its thread stays intact.
- **Attachments:** you can only attach your own uploads.
- **Mentions:** `@Name`, `@channel` and `@here` are parsed on insert and feed Mentions and Activity.
- **Secrets:** bot tokens, webhook secrets and invite tokens are stored as SHA-256 hashes.

## Invite-only sign-in

Nobody can create an account or reach the app without an invitation.

1. `POST /api/auth/otp` only issues a code when `is_email_allowed()` finds a pending invitation or an active membership. Others get `403 not_invited`.
2. `POST /api/auth/verify` creates the user on first sign-in; pending invitations are claimed (`claim_pending_invitations`). No active membership → `403 no_access`, no session.
3. `requireUser` checks the session and an active membership on every request, so removed people lose access immediately.
4. `proxy.ts` rejects requests without a session cookie or Bearer token. Public: `/login`, `/invite/*`, `/api/auth/*`, and the bot and webhook endpoints, which have their own secrets.

| Method | Path | What |
|---|---|---|
| POST | `/api/auth/otp` | `{ email }` → issues a 6-digit code if invited, else `403 not_invited` |
| POST | `/api/auth/verify` | `{ email, token }` → session cookie + `token` + `needs_profile` |
| POST | `/api/auth/logout` | Ends the session |

## Not included

- Rate limiting (beyond one code per email every 20 s and 5 attempts per code)
- Email sending (sign-in codes and invitations are logged, not emailed)
- Google sign-in
- Push notifications
- Message edit history
