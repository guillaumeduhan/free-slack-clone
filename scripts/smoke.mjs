// End-to-end check of the API against a running dev server and a seeded database.
//   npm run smoke                 (BASE_URL defaults to http://localhost:3002)
// Signs in as OWNER_EMAIL and a demo teammate using the dev_code returned outside production.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
for (const f of ['.env.local', '.env']) if (existsSync(join(root, f))) process.loadEnvFile(join(root, f));

const BASE = process.env.BASE_URL ?? 'http://localhost:3002';
const OWNER = process.env.OWNER_EMAIL;
if (!OWNER) throw new Error('OWNER_EMAIL is not set');

let failures = 0;
const check = (label, cond, extra) => {
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

function client(cookie = '') {
  const call = async (method, path, body, raw) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(cookie && { cookie }), ...(body !== undefined && !raw && { 'content-type': 'application/json' }) },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, json: type.includes('json') ? await res.json() : null, res };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    put: (p, b) => call('PUT', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p),
    raw: (method, p, bytes) => call(method, p, undefined, bytes),
    cookie: () => cookie,
  };
}

async function signIn(email) {
  const c = client();
  const otp = await c.post('/api/auth/otp', { email });
  check(`otp sent to ${email}`, otp.status === 200 && otp.json.data.dev_code, otp.json);
  const v = await c.post('/api/auth/verify', { email, token: otp.json.data.dev_code });
  check(`verify ${email}`, v.status === 200 && c.cookie().startsWith('tc_session='), v.json);
  return c;
}

// --- auth gates -------------------------------------------------------
const anon = client();
check('anonymous → 401', (await anon.get('/api/me')).status === 401);
check('uninvited email → 403', (await anon.post('/api/auth/otp', { email: 'nobody@nowhere.test' })).status === 403);

const owner = await signIn(OWNER);
const marc = await signIn('marc@northwind.test');

const me = await owner.get('/api/me');
check('GET /api/me', me.status === 200 && me.json.data.email === OWNER.toLowerCase(), me.json);
const ws = (await owner.get('/api/workspaces')).json.data.find((w) => w.slug === 'northwind');
check('owner is owner of Northwind', ws?.role === 'owner', ws);
const W = `/api/workspaces/${ws.id}`;

// --- sidebar, members, channels ----------------------------------------
const side = await owner.get(`${W}/conversations`);
check('sidebar lists #general', side.json.data.channels.some((c) => c.name === 'general'), side.json);
const browse = await owner.get(`${W}/conversations?browse=1`);
check('browse lists 6 public channels', browse.json.data.length === 6, browse.json.data.length);
const members = await owner.get(`${W}/members`);
check('members include demo teammates', members.json.data.members.length >= 5, members.json.data.counts);

const general = side.json.data.channels.find((c) => c.name === 'general');
const G = `/api/conversations/${general.id}`;
const page = await owner.get(`${G}/messages?limit=2`);
check('timeline paginates', page.json.data.messages.length === 2 && page.json.data.next_before, page.json.data.next_before);

const name = `smoke-${Date.now().toString(36)}`;
const ch = await owner.post(`${W}/conversations`, { name, private: true, topic: 'smoke test' });
check('create private channel', ch.status === 201 && ch.json.data.kind === 'private_channel', ch.json);
check('private channel hidden from marc (RLS)', (await marc.get(`/api/conversations/${ch.json.data.id}`)).status === 404);
check('duplicate channel name → 409', (await owner.post(`${W}/conversations`, { name })).status === 409);

// --- realtime (marc listens, owner posts) -------------------------------
const ac = new AbortController();
const events = [];
const sse = await fetch(`${BASE}${W}/events`, { headers: { cookie: marc.cookie() }, signal: ac.signal });
check('SSE stream opens', sse.status === 200 && sse.headers.get('content-type')?.startsWith('text/event-stream'));
(async () => {
  const dec = new TextDecoder();
  try {
    for await (const chunk of sse.body) events.push(dec.decode(chunk));
  } catch { /* aborted */ }
})();
await new Promise((r) => setTimeout(r, 300));

// --- messages, threads, reactions, mentions ------------------------------
const msg = await owner.post(`${G}/messages`, { text: 'Smoke test hello @Marc Dubois' });
check('post message', msg.status === 201 && msg.json.data.author.email === undefined && msg.json.data.body.includes('Smoke'), msg.json);
const M = `/api/messages/${msg.json.data.id}`;
const reply = await marc.post(`${M}/replies`, { text: 'Reply from Marc', also_send_to_channel: true });
check('marc replies in thread', reply.status === 201 && reply.json.data.parent_id === msg.json.data.id, reply.json);
const thread = await owner.get(`${M}/replies`);
check('thread has root + reply', thread.json.data.root.reply_count === 1 && thread.json.data.replies.length === 1, thread.json.data.root);
const rx = await marc.post(`${M}/reactions`, { emoji: '🎉' });
check('reaction summary', rx.json.data[0]?.emoji === '🎉' && rx.json.data[0].mine, rx.json);
const mentions = await marc.get(`/api/me/feed?workspace_id=${ws.id}&kind=mentions`);
check('marc sees the mention', mentions.json.data.some((f) => f.message_id === msg.json.data.id), mentions.json);
const activity = await owner.get(`/api/me/feed?workspace_id=${ws.id}&kind=activity`);
check('owner activity has reaction', activity.json.data.some((f) => f.item === 'reaction'), activity.json);
await owner.put(`${M}/save`);
const saved = await owner.get(`/api/me/feed?workspace_id=${ws.id}&kind=saved`);
check('saved for later', saved.json.data.some((f) => f.message_id === msg.json.data.id), saved.json);
const edit = await owner.patch(M, { text: 'Smoke test edited' });
check('edit own message', edit.json.data.edited_at && edit.json.data.body === 'Smoke test edited', edit.json);
check("can't edit someone else's message", (await marc.patch(M, { text: 'hack' })).status === 404);
const search = await owner.get(`${W}/search?q=edited`);
check('full-text search', search.json.data.messages.some((m) => m.id === msg.json.data.id), search.json);
await owner.put(`${G}/draft`, { body: 'half-written' });
const drafts = await owner.get(`/api/me/feed?workspace_id=${ws.id}&kind=drafts`);
check('draft saved', drafts.json.data.some((d) => d.body === 'half-written'), drafts.json);
await owner.del(`${G}/draft`);
const read = await marc.post(`${G}/read`, { message_id: reply.json.data.id });
check('mark read', read.status === 200, read.json);

// --- DMs -----------------------------------------------------------------
const marcId = (await marc.get('/api/me')).json.data.id;
const dm = await owner.post(`${W}/dms`, { user_ids: [marcId] });
const dm2 = await marc.post(`${W}/dms`, { user_ids: [me.json.data.id] });
check('open DM is idempotent', dm.json.data.kind === 'dm' && dm.json.data.id === dm2.json.data.id, [dm.json, dm2.json]);

// --- files -----------------------------------------------------------------
const bytes = new TextEncoder().encode('hello file');
const reg = await owner.post(`${W}/files`, { name: 'hello.txt', mime_type: 'text/plain', size_bytes: bytes.length });
const up = await owner.raw('PUT', reg.json.data.upload.url, bytes);
check('upload file bytes', up.status === 200, up.json);
const withFile = await owner.post(`${G}/messages`, { text: 'with file', file_ids: [reg.json.data.file.id] });
check('message has file', withFile.json.data.files[0]?.url, withFile.json);
const dl = await marc.get(withFile.json.data.files[0].url);
check('teammate downloads file', dl.status === 200 && (await dl.res.text()) === 'hello file');

// --- invitations, apps, bot, webhook -----------------------------------------
const inv = await owner.post(`${W}/invitations`, { email: `new-${Date.now()}@example.test` });
check('invite returns link', inv.status === 201 && inv.json.data.invite_url.includes('/invite/'), inv.json);
check('members cannot invite', (await marc.post(`${W}/invitations`, { email: 'x@example.test' })).status === 403);
check('revoke invite', (await owner.del(`/api/invitations/${inv.json.data.invitation.id}`)).status === 200);

const deploys = browse.json.data.find((c) => c.name === 'deploys');
const app = await owner.post(`${W}/apps`, { name: 'CI Bot', kind: 'bot', default_conversation_id: deploys.id });
check('create app', app.status === 201 && app.json.data.token.startsWith('xoxb-') && app.json.data.webhook_url, app.json);
const bot = await fetch(`${BASE}/api/bot/chat.postMessage`, {
  method: 'POST',
  headers: { authorization: `Bearer ${app.json.data.token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ channel: '#deploys', text: 'Deploy finished ✅' }),
}).then((r) => r.json());
check('bot chat.postMessage', bot.ok && bot.ts, bot);
const hook = await fetch(app.json.data.webhook_url, { method: 'POST', body: JSON.stringify({ text: 'From webhook' }) });
check('incoming webhook', hook.status === 200);
check('delete app', (await owner.del(`/api/apps/${app.json.data.app.id}`)).status === 200);

// --- cleanup + realtime result -------------------------------------------------
check('delete own message', (await owner.del(M)).status === 200);
await owner.patch(`/api/conversations/${ch.json.data.id}`, { archived: true });
await new Promise((r) => setTimeout(r, 500));
ac.abort();
const got = events.join('');
check('marc received realtime events', got.includes('event: change') && got.includes(`"message_id":${msg.json.data.id}`), got.slice(0, 300));
check('private channel events not leaked', !got.includes(ch.json.data.id));

check('logout', (await owner.post('/api/auth/logout')).status === 200);
check('session gone after logout', (await owner.get('/api/me')).status === 401);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
