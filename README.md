<div align="center">

# 💬 Slack clone

**A real-time team chat you can run with one command.**
Channels, threads, DMs, reactions, mentions, files, search, bots and webhooks, on Next.js 16 and plain PostgreSQL.

![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-RLS-4169e1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)

</div>

---

## ⚡ Quick start

```bash
git clone https://github.com/guillaumeduhan/slack-clone.git && cd slack-clone && make
```

That's it. Open **http://localhost:3002** and sign in as `owner@example.com`. In dev, the 6-digit code shows up right on the login screen.

> No Docker, no Postgres to install, no `.env` to fill in. `make` installs dependencies, boots an **embedded PostgreSQL** in `.data/`, runs the migrations, seeds a workspace and starts the app. `Ctrl-C` stops everything.
>
> No `make`? Run `npm install && npm run dev`. You need **Node.js 22+**.

## ✨ Features

| | |
|---|---|
| 💬 **Messaging** | Public and private channels, DMs and group DMs, threads with "also send to channel" |
| 😀 **Reactions & mentions** | Emoji reactions, `@name`, `@channel`, `@here`, Mentions and Activity feeds |
| ⚡ **Real time** | Postgres `LISTEN/NOTIFY` streamed over Server-Sent Events, unread counts and "New" divider |
| 📎 **Files** | Uploads stored in Postgres; images, video, audio and PDF render inline |
| 🔎 **Search** | Full-text search across people, channels and messages |
| 📝 **Drafts & saved** | Composer drafts per conversation and thread, save for later |
| 🔐 **Invite-only auth** | Passwordless email codes, hashed sessions, roles (owner, admin, member), ownership transfer |
| 🤖 **Apps & bots** | Bot tokens with a Slack-style `chat.postMessage`, plus incoming webhooks |
| 🌗 **Themes** | Dark and light, design tokens as CSS variables |

## 🧱 How it's built

```
Browser ──► Next.js 16 route handlers ──► PostgreSQL (schema "chat")
   ▲              │  zod validation           ├─ row-level security per request
   │              │  set local role chat_user ├─ SQL functions for business rules
   └── SSE ◄──────┴──── LISTEN chat ◄─────────┴─ NOTIFY triggers
```

- **The database enforces the rules.** Every request runs as `chat_user` with the caller's id, so row-level security decides what each person can read and write.
- **Thin handlers.** Route handlers validate input with zod, run SQL and shape JSON. There's no ORM and no external service; the only dependency is `DATABASE_URL`.
- **UI.** React 19, Tailwind 4, SWR for data (revalidated by the event stream) and zustand for UI state.

Full endpoint list and conventions: **[docs/API.md](docs/API.md)**.

## 🛠️ Commands

| Command | What it does |
|---|---|
| `make` / `npm run dev` | Postgres + migrations + seed + app on :3002 |
| `make smoke` | End-to-end API check, 40+ assertions (with the app running) |
| `make reset` | Drop and re-create the `chat` schema (with the app running) |
| `make typecheck` · `make lint` | TypeScript · ESLint |
| `make lan` | Serve on `http://slack.local` for devices on your Wi-Fi |
| `make tunnel` | Public https URL via a Cloudflare quick tunnel |
| `make clean` | Delete the local embedded database |

## ⚙️ Configuration

All optional, in `.env.local` (see [`.env.example`](.env.example)):

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | embedded Postgres on port 54329 | Use your own Postgres 15+ instead |
| `OWNER_EMAIL` | `owner@example.com` | Invited as the workspace owner |
| `WORKSPACE_NAME` | `Default Workspace` | Created with a single `#general` channel |
| `PORT` | `3002` | App port |

## 📁 Project layout

```
app/              pages (/, /login, /invite) and app/api/**/route.ts
components/chat/  one file per area: rail, sidebar, channel, message, composer, thread, dialogs…
hooks/            SWR data hooks + zustand UI store
lib/              db pool & RLS transactions, auth, HTTP helpers, realtime hub
db/migrations/    schema, RLS policies, SQL functions, triggers
scripts/          dev.mjs (one-command start), migrate.mjs, smoke.mjs, lan.mjs
```

## 🚧 Not included (yet)

Email delivery (codes and invites are logged), Google sign-in, push notifications, message edit history, rate limiting beyond sign-in codes.
