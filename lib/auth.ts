import { createHash, randomBytes } from 'node:crypto';
import { asUser, pool, type Tx } from './db';
import { HttpError } from './http';
import { SESSION_COOKIE } from './session';

export type Role = 'owner' | 'admin' | 'member';
export const ANY: Role[] = ['owner', 'admin', 'member'];
export const ADMIN: Role[] = ['owner', 'admin'];

export { SESSION_COOKIE };
export const SESSION_DAYS = 30;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const newSessionToken = () => `tcs_${randomBytes(32).toString('hex')}`;

/** Session token from `Authorization: Bearer tcs_…` (native clients) or the session cookie. */
export function sessionToken(req: Request) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer (tcs_[a-f0-9]{64})$/)?.[1];
  if (bearer) return bearer;
  const cookie = req.headers.get('cookie') ?? '';
  return cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=(tcs_[a-f0-9]{64})`))?.[1] ?? null;
}

export function sessionCookie(token: string | null, req: Request) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return token
    ? `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
    : `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/**
 * Resolves the signed-in user. Requires a live session and at least one
 * active membership (removed people lose access immediately).
 * `db` runs a transaction as that user, with row-level security.
 */
export async function requireUser(req: Request) {
  const token = sessionToken(req);
  if (!token) throw new HttpError(401, 'Sign in required', 'unauthorized');
  const { rows } = await pool.query<{ user_id: string; active: boolean }>(
    `with s as (
       select user_id from chat.sessions where token_hash = $1 and expires_at > now()
     ), seen as (
       update chat.users set last_seen_at = now()
        where id = (select user_id from s) and (last_seen_at is null or last_seen_at < now() - interval '1 minute')
     )
     select s.user_id,
            exists (select 1 from chat.workspace_members wm
                     where wm.user_id = s.user_id and wm.deactivated_at is null) as active
       from s`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) throw new HttpError(401, 'Sign in required', 'unauthorized');
  if (!row.active) throw new HttpError(403, 'Your account is not a member of any workspace', 'no_access');
  const uid = row.user_id;
  return { uid, db: <T>(fn: (tx: Tx) => Promise<T>) => asUser(uid, fn) };
}

export async function requireRole(tx: Tx, workspaceId: string, uid: string, roles: Role[] = ANY) {
  const row = await tx.maybe<{ role: Role }>(
    'select role from workspace_members where workspace_id = $1 and user_id = $2 and deactivated_at is null',
    [workspaceId, uid],
  );
  if (!row) throw new HttpError(404, 'Workspace not found', 'not_found');
  if (!roles.includes(row.role)) throw new HttpError(403, `Requires role: ${roles.join(' or ')}`, 'forbidden');
  return row.role;
}

export type Conversation = {
  id: string; workspace_id: string; kind: string; name: string | null; topic: string | null;
  description: string | null; archived_at: string | null; created_at: string;
};

/** 404s unless the user can read the conversation (RLS decides). */
export async function requireConversation(tx: Tx, conversationId: string) {
  const conv = await tx.maybe<Conversation>(
    'select id, workspace_id, kind, name, topic, description, archived_at, created_at from conversations where id = $1',
    [conversationId],
  );
  if (!conv) throw new HttpError(404, 'Conversation not found', 'not_found');
  return conv;
}

/**
 * True when the request comes from this machine or the local network (localhost,
 * *.localhost, *.local, private IPs) and not through a public tunnel. Dev conveniences
 * like showing the sign-in code are limited to these requests.
 */
export function isLocalRequest(req: Request) {
  if (req.headers.get('cf-connecting-ip')) return false; // came through a Cloudflare tunnel
  return isLocalHost(req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '');
}

function isLocalHost(hostHeader: string) {
  const host = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}
