import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Reachable without a session.
const PUBLIC = [/^\/login/, /^\/invite\//, /^\/auth\//, /^\/api\/auth\//, /^\/api\/bot\//, /^\/api\/hooks\//];

/**
 * Every page and API route requires a signed-in user who is an active member
 * of at least one workspace. Row-level security still applies behind this.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  let res = NextResponse.next({ request: req });
  if (PUBLIC.some((r) => r.test(pathname))) return res;

  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: 'teamchat' },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const deny = (error: string) => {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: { code: error, message: 'Sign in required' } }, { status: 401 });
    }
    const to = new URL('/login', req.url);
    to.searchParams.set('next', pathname + search);
    if (error !== 'unauthorized') to.searchParams.set('error', error);
    return NextResponse.redirect(to);
  };

  // Bearer-JWT API clients are verified in the route handler (lib/auth.ts).
  if (pathname.startsWith('/api/') && req.headers.get('authorization')?.startsWith('Bearer ey')) return res;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return deny('unauthorized');

  const { count } = await sb
    .from('workspace_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deactivated_at', null);
  if (!count) {
    await sb.auth.signOut();
    return deny('no_access');
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
};
