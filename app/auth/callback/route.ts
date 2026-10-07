import { NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase';

/**
 * OAuth (Google) return URL. If the Before User Created hook rejected the
 * account, Supabase redirects here with ?error=… instead of a code.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const login = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, url.origin));

  const err = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (err) return login(/invitation-only|403/i.test(err) ? 'not_invited' : 'oauth_failed');

  const code = url.searchParams.get('code');
  if (!code) return login('oauth_failed');

  const sb = await userClient();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.user) return login('oauth_failed');

  const { count } = await sb
    .schema('teamchat')
    .from('workspace_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', data.user.id)
    .is('deactivated_at', null);
  if (!count) {
    await sb.auth.signOut();
    return login('no_access');
  }
  const next = url.searchParams.get('next');
  return NextResponse.redirect(new URL(next?.startsWith('/') ? next : '/', url.origin));
}
