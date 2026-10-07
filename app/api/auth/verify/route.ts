import { z } from 'zod';
import { route, ok, body, HttpError } from '@/lib/http';
import { userClient } from '@/lib/supabase';

/** Step 2: verify the 6-digit code. Sets the session cookie on success. */
export const POST = route(async (req) => {
  const { email, token } = await body(
    req,
    z.object({ email: z.string().trim().toLowerCase().email(), token: z.string().regex(/^\d{6}$/) }),
  );
  const sb = await userClient();
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) throw new HttpError(401, 'That code is incorrect or has expired', 'invalid_code');

  const { data: rows } = await sb
    .schema('teamchat')
    .from('workspace_members')
    .select('workspace_id, role, workspace:workspaces(slug)')
    .eq('user_id', data.user.id)
    .is('deactivated_at', null);
  if (!rows?.length) {
    await sb.auth.signOut();
    throw new HttpError(403, 'Your account is not a member of any workspace', 'no_access');
  }
  const { data: me } = await sb.schema('teamchat').from('users').select('display_name, title').eq('id', data.user.id).single();
  const needsProfile = !me?.display_name || me.display_name === email.split('@')[0];
  return ok({ workspaces: rows, needs_profile: needsProfile });
});
