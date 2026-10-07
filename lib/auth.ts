import { bearerJwt, userClient, type DB } from './supabase';
import { HttpError, db } from './http';

export type Role = 'owner' | 'admin' | 'member';
export const ANY: Role[] = ['owner', 'admin', 'member'];
export const ADMIN: Role[] = ['owner', 'admin'];

/** Resolves the signed-in user (cookie session or Bearer JWT). */
export async function requireUser(req: Request) {
  const sb = await userClient(req);
  const { data, error } = await sb.auth.getUser(bearerJwt(req));
  if (error || !data.user) throw new HttpError(401, 'Sign in required', 'unauthorized');
  return { sb, uid: data.user.id };
}

export async function requireRole(sb: DB, workspaceId: string, uid: string, roles: Role[] = ANY) {
  const { data } = await sb
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', uid)
    .is('deactivated_at', null)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'Workspace not found', 'not_found');
  if (!roles.includes(data.role as Role)) throw new HttpError(403, `Requires role: ${roles.join(' or ')}`, 'forbidden');
  return data.role as Role;
}

/** 404s unless the user can read the conversation (RLS decides). */
export async function requireConversation(sb: DB, conversationId: string) {
  return db(
    await sb
      .from('conversations')
      .select('id, workspace_id, kind, name, topic, description, archived_at, created_at')
      .eq('id', conversationId)
      .single(),
  );
}
