import { z } from 'zod';
import { NextResponse } from 'next/server';
import { route, body, HttpError } from '@/lib/http';
import { asServer } from '@/lib/db';
import { newSessionToken, sessionCookie, sha256, SESSION_DAYS } from '@/lib/auth';

/**
 * Sign in with an invitation link (/invite/:token). The link was sent to the invited
 * address, so holding it proves access to that email, like a magic link: no code needed.
 * The invitation is accepted (claimed) on the way in.
 */
export const POST = route(async (req) => {
  const { token } = await body(req, z.object({ token: z.string().min(16).max(200) }));

  const out = await asServer(async (tx) => {
    const inv = await tx.maybe<{ email: string }>(
      `select email from invitations where token_hash = hash_secret($1) and status = 'pending' and expires_at > now() for update`,
      [token],
    );
    if (!inv) throw new HttpError(404, 'This invitation link is invalid or has expired', 'invalid_invite');

    let user = await tx.maybe<{ id: string; display_name: string }>(
      'select id, display_name from users where email = $1 and not is_bot', [inv.email],
    );
    if (user) await tx.exec('select claim_pending_invitations($1)', [user.id]);
    else user = await tx.maybe('insert into users (email, display_name) values ($1, $2) returning id, display_name', [inv.email, inv.email.split('@')[0]]);

    const workspaces = await tx.many(
      `select wm.workspace_id, wm.role, json_build_object('slug', w.slug, 'name', w.name) as workspace
         from workspace_members wm join workspaces w on w.id = wm.workspace_id
        where wm.user_id = $1 and wm.deactivated_at is null`,
      [user!.id],
    );
    const session = newSessionToken();
    await tx.exec(
      `insert into sessions (user_id, token_hash, user_agent, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))`,
      [user!.id, sha256(session), req.headers.get('user-agent')?.slice(0, 300) ?? null, SESSION_DAYS],
    );
    return { session, workspaces, needs_profile: user!.display_name === inv.email.split('@')[0] };
  });

  const res = NextResponse.json({ ok: true, data: { token: out.session, workspaces: out.workspaces, needs_profile: out.needs_profile } });
  res.headers.append('set-cookie', sessionCookie(out.session, req));
  return res;
});
