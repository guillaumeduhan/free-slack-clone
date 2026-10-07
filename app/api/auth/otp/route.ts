import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { route, ok, body, HttpError } from '@/lib/http';
import { asServer } from '@/lib/db';
import { sha256 } from '@/lib/auth';

const CODE_TTL_MINUTES = 10;

/**
 * Step 1 of email sign-in. Only invited emails or active members get a code,
 * so uninvited addresses get a clear 403.
 *
 * Email delivery isn't wired yet: the code is printed in the server log, and
 * returned as `dev_code` outside production so the login screen can show it.
 */
export const POST = route(async (req) => {
  const { email } = await body(req, z.object({ email: z.string().trim().toLowerCase().email() }));
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

  await asServer(async (tx) => {
    const allowed = await tx.maybe<{ ok: boolean }>('select is_email_allowed($1) as ok', [email]);
    if (!allowed?.ok) throw new HttpError(403, 'No invitation found for this email', 'not_invited');
    const recent = await tx.maybe(
      `select 1 from sign_in_codes where email = $1 and created_at > now() - interval '20 seconds'`, [email],
    );
    if (recent) throw new HttpError(429, 'Too many attempts, try again in a few seconds', 'rate_limited');
    await tx.exec(
      `insert into sign_in_codes (email, code_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))
       on conflict (email) do update
         set code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = now()`,
      [email, sha256(`${email}:${code}`), CODE_TTL_MINUTES],
    );
  });

  console.log(`[auth] sign-in code for ${email}: ${code}`);
  return ok({ sent: true, ...(process.env.NODE_ENV !== 'production' ? { dev_code: code } : {}) });
});
