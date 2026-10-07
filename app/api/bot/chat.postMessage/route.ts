import { NextResponse } from 'next/server';
import { z } from 'zod';
import { asServer } from '@/lib/db';

/**
 * Bot API, Slack-compatible shape.
 *
 * curl -X POST https://your-app.com/api/bot/chat.postMessage \
 *   -H "Authorization: Bearer xoxb-…" -H "Content-Type: application/json" \
 *   -d '{"channel":"#deploys","text":"Deploy finished ✅"}'
 */
const Body = z.object({
  channel: z.string().min(1).max(100),           // "#name" or conversation uuid
  text: z.string().min(1).max(40_000),
  thread_ts: z.union([z.string(), z.number()]).optional(), // root message id to reply in thread
});

const ERR: Record<string, number> = { '28000': 401, P0002: 404, '42501': 403, '22023': 422 };

const fail = (status: number, error: string, extra?: object) => NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.match(/^Bearer (xoxb-[a-f0-9]+)$/)?.[1];
  if (!token) return fail(401, 'not_authed');

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'invalid_arguments', { issues: parsed.error.issues });
  const { channel, text, thread_ts } = parsed.data;

  let data: { id: number; conversation_id: string; user_id: string; body: string; parent_id: number | null };
  try {
    data = (await asServer((tx) =>
      tx.maybe<typeof data>('select * from bot_post_message($1, $2, $3, $4)', [
        token, channel, text, thread_ts == null ? null : Number(thread_ts),
      ]),
    ))!;
  } catch (e) {
    const { code, message } = e as { code?: string; message: string };
    const status = ERR[code ?? ''];
    if (!status) console.error(e);
    return fail(status ?? 500, status ? message : 'internal_error');
  }

  const ts = String(data.id);
  return NextResponse.json({
    ok: true,
    channel: data.conversation_id,
    ts,
    message: { type: 'message', subtype: 'bot_message', user: data.user_id, text: data.body, ts, thread_ts: data.parent_id ? String(data.parent_id) : undefined },
  });
}
