import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route, ok, body } from '@/lib/http';
import { MAX_FILE_BYTES } from '@/lib/files';

type P = { workspaceId: string };

const Create = z.object({
  name: z.string().trim().min(1).max(255),
  mime_type: z.string().min(3).max(255),
  size_bytes: z.number().int().min(0).max(MAX_FILE_BYTES),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  duration_ms: z.number().int().positive().nullable().default(null),
});

/**
 * Step 1 of an upload: registers the file.
 * Step 2 (client): PUT the raw bytes to upload.url
 * Step 3: POST the message with file_ids: [file.id]
 */
export const POST = route<P>(async (req, { workspaceId }) => {
  const { uid, db } = await requireUser(req);
  const b = await body(req, Create);
  const file = await db(async (tx) => {
    await requireRole(tx, workspaceId, uid);
    const id = crypto.randomUUID();
    return tx.maybe<{ id: string }>(
      `insert into files (id, workspace_id, uploader_id, storage_key, name, mime_type, size_bytes, width, height, duration_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, name, mime_type, size_bytes, width, height, duration_ms, created_at`,
      [id, workspaceId, uid, `${workspaceId}/${id}`, b.name, b.mime_type, b.size_bytes, b.width, b.height, b.duration_ms],
    );
  });
  return ok({ file, upload: { method: 'PUT', url: `/api/files/${file!.id}/content` } }, 201);
});
