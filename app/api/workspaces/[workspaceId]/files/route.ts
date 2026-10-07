import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body, db } from '@/lib/http';
import { adminClient } from '@/lib/supabase';

type P = { workspaceId: string };

const Create = z.object({
  name: z.string().trim().min(1).max(255),
  mime_type: z.string().min(3).max(255),
  size_bytes: z.number().int().min(0).max(1024 ** 3),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  duration_ms: z.number().int().positive().nullable().default(null),
});

/**
 * Step 1 of an upload: registers the file and returns a signed upload URL.
 * Step 2 (client): supabase.storage.from('files').uploadToSignedUrl(path, token, blob)
 * Step 3: POST the message with file_ids: [file.id]
 */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { sb, uid } = await requireUser(req);
  await requireRole(sb, workspaceId, uid);
  const b = await body(req, Create);
  const id = crypto.randomUUID();
  const key = `${workspaceId}/${id}/${b.name.replace(/[^\w.\-]+/g, '_')}`;

  const upload = db(await adminClient().storage.from('files').createSignedUploadUrl(key));
  const file = db(
    await sb
      .from('files')
      .insert({ id, workspace_id: workspaceId, uploader_id: uid, storage_key: key, ...b })
      .select('id, name, mime_type, size_bytes, width, height, duration_ms, created_at')
      .single(),
  );
  return ok({ file, upload: { path: upload.path, token: upload.token, signed_url: upload.signedUrl } }, 201);
});
