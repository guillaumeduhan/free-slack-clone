# Team Chat API · Next.js 15 + Supabase

Route handlers for every action in the Team Chat prototype, built on `supabase/migrations/0001_schema.sql`.

- **Business rules live in Postgres:** row-level security and RPC functions in `0002_supabase_rls_and_functions.sql` enforce them.
- **Handlers stay thin:** they validate input with zod, call Supabase as the signed-in user, and shape the JSON.

## Quick start

```bash
chmod +x setup.sh
OWNER_EMAIL=you@company.com ./setup.sh local     # Supabase in Docker
# or
OWNER_EMAIL=you@company.com SUPABASE_PROJECT_REF=abcd1234 ./setup.sh remote
```

`setup.sh` runs these steps in order:
1. Checks Node 20+, psql, and (local only) Docker.
2. Creates the Next.js app (TypeScript, Tailwind, App Router) and copies these files into it.
3. Installs shadcn/ui and its components.
4. Starts or links Supabase, then applies the 3 migrations.
5. Runs `supabase/bootstrap.sql`: creates the Northwind workspace and its channels, and invites `OWNER_EMAIL`.
6. Writes `.env.local` and generates TypeScript types.
7. Starts `npm run dev`.

To sign in:
1. Open `http://localhost:3000/login` and enter your email.
2. Locally, the code arrives at `http://127.0.0.1:54324`.
3. The first sign-in makes you the owner of Northwind.

## Manual setup

```bash
npm i @supabase/supabase-js @supabase/ssr zod
cp .env.example .env.local          # fill in URL, anon key, service role key
supabase db push                    # or run both migrations in the SQL editor
```

Then in the Supabase dashboard, open **Project Settings → API → Exposed schemas** and add `teamchat`.

Optionally generate types: `supabase gen types typescript --schema teamchat > lib/database.types.ts`.

## Layout

```
lib/
  supabase.ts   userClient (RLS, cookie or Bearer JWT) · adminClient (service role)
  http.ts       route() wrapper, ok(), body()/query() zod parsing, Postgres → HTTP errors
  auth.ts       requireUser · requireRole · requireConversation
  messages.ts   MESSAGE_SELECT, reaction summaries, signed file URLs
app/api/…       one route.ts per resource (below)
supabase/migrations/
  0001_schema.sql                     tables, enums, indexes, triggers
  0002_supabase_rls_and_functions.sql grants, RLS, RPCs, realtime, storage bucket
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
- Browser clients use the Supabase session cookie.
- Native clients send `Authorization: Bearer <supabase JWT>`.
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
| POST | `/api/workspaces/:id/files` | member | Register an upload → signed upload URL |

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
await supabase.storage.from('files').uploadToSignedUrl(data.upload.path, data.upload.token, blob);
await api.post(`/api/conversations/${conv}/messages`, { text, file_ids: [data.file.id] });
```

Files are private. Message payloads include one-hour signed URLs.

**Realtime**

`messages`, `reactions` and `conversation_members` are published. RLS applies, so clients only receive rows they can read.

```ts
supabase
  .channel(`conv:${id}`)
  .on('postgres_changes', { event: '*', schema: 'teamchat', table: 'messages', filter: `conversation_id=eq.${id}` }, onChange)
  .subscribe();
```

## Rules enforced in the database

- **Ownership:** exactly one owner per workspace (partial unique index). Ownership only changes through `transfer_ownership`.
- **Channel names:** lowercase-with-hyphens, unique per workspace.
- **Deleting messages:** you can only delete your own. The message is soft-deleted so its thread stays intact.
- **Attachments:** you can only attach your own uploads.
- **Mentions:** `@Name`, `@channel` and `@here` are parsed on insert and feed Mentions and Activity.
- **Secrets:** bot tokens, webhook secrets and invite tokens are stored as SHA-256 hashes.

## Invite-only sign-in

Nobody can create an account or reach the app without an invitation. Four layers enforce this.

**1. Supabase Auth hook** (`0003_invite_only_auth.sql`)
- `public.teamchat_before_user_created` rejects any new auth user whose email has no pending invitation and no active membership.
- This covers email codes, magic links, Google, and direct calls to the Supabase API.
- Enable it in **Authentication → Hooks → Before User Created**.

**2. Pre-check before sending a code**
- `POST /api/auth/otp` checks the invite list before Supabase sends anything.
- Uninvited emails get a `403 not_invited` and never receive an email.

**3. Membership check after sign-in**
- `POST /api/auth/verify` (email code) and `GET /auth/callback` (Google) sign the user out again if they have no active membership.
- This catches people who were removed from the workspace.

**4. `middleware.ts`**
- Every page and `/api/*` route needs a session plus at least one active membership.
- Public routes: `/login`, `/invite/*`, `/auth/*`, `/api/auth/*`, and the bot and webhook endpoints, which have their own secrets.

Invitations are claimed automatically on first sign-in (`claim_invitations` trigger), so invited people don't need the link.

| Method | Path | What |
|---|---|---|
| POST | `/api/auth/otp` | `{ email }` → sends a 6-digit code if invited, else `403 not_invited` |
| POST | `/api/auth/verify` | `{ email, token }` → session cookie + `needs_profile` |
| GET | `/auth/callback` | OAuth return URL (set it as the Supabase redirect URL) |

## Not included

- Rate limiting
- Email sending for invitations
- Push notifications
- Message edit history
