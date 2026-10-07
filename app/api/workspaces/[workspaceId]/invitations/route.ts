import { z } from 'zod';
import { requireUser, requireRole, ADMIN } from '@/lib/auth';
import { route, ok, body, db } from '@/lib/http';

type P = { workspaceId: string };

/** Owner/admin: pending invitations. */
export const GET = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid, ADMIN);
  return ok(
    db(
      await sb
        .from('invitations')
        .select('id, email, role, status, invited_by, created_at, expires_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ),
  );
});

const Create = z.object({ email: z.string().trim().email(), role: z.enum(['admin', 'member']).default('member') });

/** Owner/admin: invite by email. The link is returned once; send it by email. */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { sb } = await requireUser(req);
  const { email, role } = await body(req, Create);
  const res = db(await sb.rpc('create_invitation', { p_ws: workspaceId, p_email: email, p_role: role })) as {
    invitation: unknown;
    token: string;
  };
  const link = new URL(`/invite/${res.token}`, req.url).toString();
  return ok({ invitation: res.invitation, invite_url: link }, 201);
});
