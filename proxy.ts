import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

// Reachable without a session (bot and webhook endpoints have their own secrets).
const PUBLIC = [/^\/login/, /^\/invite\//, /^\/api\/auth\//, /^\/api\/bot\//, /^\/api\/hooks\//];

/**
 * Fast gate: no session cookie or Bearer token → 401 (API) or /login (pages).
 * The session itself, membership and row-level security are checked in each
 * route handler (lib/auth.ts requireUser), never here alone.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.has(SESSION_COOKIE) || req.headers.get('authorization')?.startsWith('Bearer tcs_')) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: { code: 'unauthorized', message: 'Sign in required' } }, { status: 401 });
  }
  const to = new URL('/login', req.url);
  to.searchParams.set('next', pathname + search);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
};
