import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';

type P = { secret: string };

/**
 * Incoming webhook: posts into the app's default channel.
 * curl -X POST https://your-app.com/api/hooks/<secret> -d '{"text":"Hello"}'
 */
export async function POST(req: Request, ctx: { params: Promise<P> }) {
  const { secret } = await ctx.params;
  if (!/^[a-f0-9]{48}$/.test(secret)) return new NextResponse('invalid_webhook', { status: 404 });

  const parsed = z.object({ text: z.string().min(1).max(40_000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse('invalid_payload', { status: 400 });

  const { error } = await adminClient().rpc('webhook_post_message', { p_secret: secret, p_text: parsed.data.text });
  if (error) {
    if (error.code === 'P0002') return new NextResponse(error.message, { status: 404 });
    console.error(error);
    return new NextResponse('internal_error', { status: 500 });
  }
  return new NextResponse('ok', { status: 200 });
}
