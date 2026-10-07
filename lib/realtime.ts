import { EventEmitter } from 'node:events';
import { Client } from 'pg';

export type ChangeEvent = {
  table: 'messages' | 'reactions' | 'conversation_members' | 'conversations';
  op: 'insert' | 'update' | 'delete';
  workspace_id: string;
  conversation_id: string | null;
  message_id: number | null;
  parent_id: number | null;
  user_id: string | null;
};

type Hub = { emitter: EventEmitter; ready: Promise<void> | null };
const g = globalThis as unknown as { chatRealtime?: Hub };
const hub: Hub = (g.chatRealtime ??= { emitter: new EventEmitter().setMaxListeners(0), ready: null });

/** One dedicated connection LISTENs on "chat" (see notify_change() in SQL) and fans out per workspace. */
function connect(): Promise<void> {
  hub.ready ??= (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const retry = () => {
      hub.ready = null;
      client.end().catch(() => {});
      setTimeout(() => connect().catch(() => {}), 2000);
    };
    client.on('error', retry);
    client.on('end', () => { if (hub.ready) retry(); });
    client.on('notification', (n) => {
      if (n.channel !== 'chat' || !n.payload) return;
      try {
        const e = JSON.parse(n.payload) as ChangeEvent;
        hub.emitter.emit(e.workspace_id, e);
      } catch { /* ignore malformed payloads */ }
    });
    await client.connect();
    await client.query('listen chat');
  })().catch((e) => {
    hub.ready = null;
    throw e;
  });
  return hub.ready;
}

export async function subscribe(workspaceId: string, fn: (e: ChangeEvent) => void) {
  await connect();
  hub.emitter.on(workspaceId, fn);
  return () => { hub.emitter.off(workspaceId, fn); };
}
