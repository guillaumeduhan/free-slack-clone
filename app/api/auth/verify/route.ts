import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { route, body, HttpError } from '@/lib/http';
import { asServer } from '@/lib/db';
import { newSessionToken, sessionCookie, sha256, SESSION_DAYS } from '@/lib/auth';

const MAX_ATTEMPTS = 5;

type Outcome =
  | { error: HttpError }
  | { token: string; workspaces: unknown[]; needs_profile: boolean };

/** Step 2: verify the 6-digit code. Sets the session cookie on success (token also returned for native clients). */
export const POST = route(async (req) => {
  const { email, token: code } = await body(
    req,
    z.object({ email: z.string().trim().toLowerCase().email(), token: z.string().regex(/^\d{6}$/) }),
  );

  // Failed attempts must be committed, so errors are returned, not thrown, inside the transaction.
  const out = await asServer<Outcome>(async (tx) => {
    const row = await tx.maybe<{ code_hash: string; attempts: number; expired: boolean }>(
      'select code_hash, attempts, expires_at < now() as expired from sign_in_codes where email = $1 for update',
      [email],
    );
    const invalid = { error: new HttpError(401, 'That code is incorrect or has expired', 'invalid_code') };
    if (!row || row.expired || row.attempts >= MAX_ATTEMPTS) return invalid;
    const a = Buffer.from(row.code_hash);
    const b = Buffer.from(sha256(`${email}:${code}`));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await tx.exec('update sign_in_codes set attempts = attempts + 1 where email = $1', [email]);
      return invalid;
    }
    await tx.exec('delete from sign_in_codes where email = $1', [email]);

    // First sign-in creates the user; the insert trigger claims pending invitations.
    let user = await tx.maybe<{ id: string; display_name: string }>(
      'select id, display_name from users where email = $1 and not is_bot', [email],
    );
    if (user) {
      await tx.exec('select claim_pending_invitations($1)', [user.id]);
    } else {
      user = await tx.maybe('insert into users (email, display_name) values ($1, $2) returning id, display_name', [
        email, email.split('@')[0],
      ]);
    }

    const workspaces = await tx.many(
      `select wm.workspace_id, wm.role, json_build_object('slug', w.slug, 'name', w.name) as workspace
         from workspace_members wm join workspaces w on w.id = wm.workspace_id
        where wm.user_id = $1 and wm.deactivated_at is null`,
      [user!.id],
    );
    if (!workspaces.length) {
      return { error: new HttpError(403, 'Your account is not a member of any workspace', 'no_access') };
    }

    const token = newSessionToken();
    await tx.exec(
      `insert into sessions (user_id, token_hash, user_agent, expires_at)
       values ($1, $2, $3, now() + make_interval(days => $4))`,
      [user!.id, sha256(token), req.headers.get('user-agent')?.slice(0, 300) ?? null, SESSION_DAYS],
    );
    return { token, workspaces, needs_profile: user!.display_name === email.split('@')[0] };
  });

  if ('error' in out) throw out.error;
  const res = NextResponse.json({ ok: true, data: out });
  res.headers.append('set-cookie', sessionCookie(out.token, req));
  return res;
});
