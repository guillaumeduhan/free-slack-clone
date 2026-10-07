import { requireUser, requireRole } from '@/lib/auth';
import { route } from '@/lib/http';
import { subscribe, type ChangeEvent } from '@/lib/realtime';

type P = { workspaceId: string };

/**
 * Server-Sent Events for one workspace: `event: change` with a ChangeEvent payload.
 * Clients refetch what changed through the regular endpoints. Events about
 * conversations the caller can't read are dropped (checked with RLS, cached briefly).
 */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  await db((tx) => requireRole(tx, workspaceId, uid));

  const readable = new Map<string, { ok: boolean; at: number }>();
  const canRead = async (conv: string) => {
    const hit = readable.get(conv);
    if (hit && Date.now() - hit.at < 30_000) return hit.ok;
    const row = await db((tx) => tx.maybe<{ ok: boolean }>('select can_read_conv($1) as ok', [conv]));
    readable.set(conv, { ok: !!row?.ok, at: Date.now() });
    return !!row?.ok;
  };

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { cleanup(); }
      };
      const onChange = async (e: ChangeEvent) => {
        const membership = e.table === 'conversation_members';
        if (membership && e.conversation_id) readable.delete(e.conversation_id);
        // My own joins/leaves always go through so the sidebar can update (even after leaving).
        const aboutMe = membership && e.user_id === uid;
        if (e.conversation_id && !aboutMe && !(await canRead(e.conversation_id).catch(() => false))) return;
        send(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
      };
      const unsubscribe = await subscribe(workspaceId, onChange);
      const heartbeat = setInterval(() => send(': ping\n\n'), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', () => cleanup());
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
});
