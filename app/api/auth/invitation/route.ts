import { z } from 'zod';
import { route, ok, query, found } from '@/lib/http';
import { asServer } from '@/lib/db';

/** Public: who invited this token's holder, for the login screen banner. `?token=…` */
export const GET = route(async (req) => {
  const { token } = query(req, z.object({ token: z.string().min(16).max(200) }));
  const inv = await asServer((tx) =>
    tx.maybe(
      `select i.email, i.role, w.name as workspace_name, u.display_name as invited_by
         from invitations i
         join workspaces w on w.id = i.workspace_id
         left join users u on u.id = i.invited_by
        where i.token_hash = hash_secret($1) and i.status = 'pending' and i.expires_at > now()`,
      [token],
    ),
  );
  return ok(found(inv, 'Invitation not found or expired'));
});
