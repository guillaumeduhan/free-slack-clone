import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { route, ok, body, HttpError } from '@/lib/http';
import { adminClient } from '@/lib/supabase';

/**
 * Step 1 of email sign-in. Checks the invite list before Supabase sends a code,
 * so uninvited addresses get a clear 403 and never receive an email.
 * (The Before User Created hook enforces the same rule inside Supabase Auth.)
 */
export const POST = route(async (req) => {
  const { email } = await body(req, z.object({ email: z.string().trim().toLowerCase().email() }));

  const { data: allowed, error } = await adminClient().rpc('is_email_allowed', { p_email: email });
  if (error) throw new HttpError(500, 'Could not check access', 'internal');
  if (!allowed) throw new HttpError(403, 'No invitation found for this email', 'not_invited');

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: otpError } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (otpError) {
    if (otpError.status === 429) throw new HttpError(429, 'Too many attempts, try again in a minute', 'rate_limited');
    throw new HttpError(otpError.status ?? 500, otpError.message, 'otp_failed');
  }
  return ok({ sent: true });
});
