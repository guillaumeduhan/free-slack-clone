import { route, ok } from '@/lib/http';
import { asServer } from '@/lib/db';

/** Public: the workspace name shown on the sign-in screen ("Sign in to …"). */
export const GET = route(async () => {
  const ws = await asServer((tx) => tx.maybe<{ name: string }>('select name from workspaces order by created_at limit 1'));
  return ok({ name: ws?.name ?? 'Team Chat' });
});
