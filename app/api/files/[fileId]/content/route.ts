import { requireUser } from '@/lib/auth';
import { route, ok, found, HttpError } from '@/lib/http';
import { MAX_FILE_BYTES } from '@/lib/files';

type P = { fileId: string };

const SAFE_INLINE = /^(image\/(png|jpe?g|gif|webp|avif)|video\/|audio\/|application\/pdf$)/;

type FileMeta = { id: string; name: string; mime_type: string; size_bytes: number; uploader_id: string };

/** Step 2 of an upload: the uploader sends the raw bytes, once. */
export const PUT = route<P>(async (req, { fileId }) => {
  const { uid, db } = await requireUser(req);
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > MAX_FILE_BYTES) throw new HttpError(413, 'File too large', 'too_large');
  await db(async (tx) => {
    const f = found(await tx.maybe<FileMeta>('select * from files where id = $1', [fileId]), 'File not found');
    if (f.uploader_id !== uid) throw new HttpError(403, 'Only the uploader can send the content', 'forbidden');
    if (data.length !== Number(f.size_bytes)) {
      throw new HttpError(422, `Expected ${f.size_bytes} bytes, got ${data.length}`, 'invalid_value');
    }
    await tx.exec('insert into file_blobs (file_id, data) values ($1, $2)', [fileId, data]);
  });
  return ok({ uploaded: true, file_id: fileId });
});

/** Download. Any member of the file's workspace can read it (RLS). */
export const GET = route<P>(async (req, { fileId }) => {
  const { db } = await requireUser(req);
  const row = await db((tx) =>
    tx.maybe<FileMeta & { data: Buffer }>(
      'select f.name, f.mime_type, b.data from files f join file_blobs b on b.file_id = f.id where f.id = $1',
      [fileId],
    ),
  );
  const f = found(row, 'File not found');
  // Only media render inline; anything else (HTML, SVG…) downloads, so it can't run on our origin.
  const inline = SAFE_INLINE.test(f.mime_type) && !new URL(req.url).searchParams.has('download');
  return new Response(new Uint8Array(f.data), {
    headers: {
      'content-type': f.mime_type,
      'content-length': String(f.data.length),
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
});
