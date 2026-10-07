import { NextResponse } from 'next/server';
import { route } from '@/lib/http';
import { asServer } from '@/lib/db';
import { sessionCookie, sessionToken, sha256 } from '@/lib/auth';

/** Ends the current session (cookie or Bearer token). */
export const POST = route(async (req) => {
  const token = sessionToken(req);
  if (token) await asServer((tx) => tx.exec('delete from sessions where token_hash = $1', [sha256(token)]));
  const res = NextResponse.json({ ok: true, data: { signed_out: true } });
  res.headers.append('set-cookie', sessionCookie(null, req));
  return res;
});
