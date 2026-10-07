import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = { schema: 'teamchat' } as const;

/** Bearer JWT from a native/mobile client, if any. */
export const bearerJwt = (req?: Request) =>
  req?.headers.get('authorization')?.match(/^Bearer (ey[\w-]+\.[\w-]+\.[\w-]+)$/)?.[1];

/** Acts as the signed-in user: every query goes through row-level security. */
export async function userClient(req?: Request) {
  const jwt = bearerJwt(req);
  if (jwt) {
    return createClient(URL, ANON, {
      db,
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }
  const store = await cookies();
  return createServerClient(URL, ANON, {
    db,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in RSC */ }
      },
    },
  });
}

/** Bypasses RLS. Server-only: bot API, webhooks, signed storage URLs. */
export function adminClient() {
  return createClient(URL, SERVICE, { db, auth: { persistSession: false } });
}

export type DB = Awaited<ReturnType<typeof userClient>>;
