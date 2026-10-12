import { NextResponse } from 'next/server';
import { z } from 'zod';
import { asServer } from '@/lib/db';

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

  try {
    await asServer((tx) => tx.exec('select webhook_post_message($1, $2)', [secret, parsed.data.text]));
  } catch (e) {
    const { code, message } = e as { code?: string; message: string };
    if (code === 'P0002') return new NextResponse(message, { status: 404 });
    console.error(e);
    return new NextResponse('internal_error', { status: 500 });
  }
  return new NextResponse('ok', { status: 200 });
}
