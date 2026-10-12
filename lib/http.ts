import { NextResponse } from 'next/server';
import { z, ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') { super(message); }
}

export const ok = (data: unknown, status = 200) => NextResponse.json({ ok: true, data }, { status });

const errorJson = (status: number, code: string, message: string, extra?: object) =>
  NextResponse.json({ ok: false, error: { code, message, ...extra } }, { status });

/** Wraps a route handler: awaits params, maps thrown errors to JSON. */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: (req: Request, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      return await handler(req, ctx?.params ? await ctx.params : ({} as P));
    } catch (e) {
      if (e instanceof HttpError) return errorJson(e.status, e.code, e.message);
      if (e instanceof ZodError) return errorJson(422, 'invalid_request', 'Request validation failed', { issues: e.issues });
      const pg = fromPg(e);
      if (pg) return errorJson(pg.status, pg.code, pg.message);
      console.error(e);
      return errorJson(500, 'internal', 'Something went wrong');
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw new HttpError(400, 'Body must be valid JSON', 'invalid_json'); }
  return schema.parse(json);
}

export const query = <T>(req: Request, schema: ZodType<T>): T =>
  schema.parse(Object.fromEntries(new URL(req.url).searchParams));

export const uuid = z.string().uuid();
export const messageId = (v: string) => z.coerce.number().int().positive().parse(v);

// Postgres error codes → HTTP. SQL functions raise with these errcodes.
const PG: Record<string, [number, string]> = {
  '28000': [401, 'unauthorized'],
  '42501': [403, 'forbidden'],
  P0002: [404, 'not_found'],
  '23505': [409, 'conflict'],
  '23503': [422, 'invalid_reference'],
  '23514': [422, 'invalid_value'],
  '22023': [422, 'invalid_value'],
  '22P02': [422, 'invalid_value'],
};

/** Maps a pg error to an HttpError, or returns null for anything else. */
export function fromPg(e: unknown): HttpError | null {
  const code = (e as { code?: unknown })?.code;
  if (typeof code !== 'string' || !(code in PG)) return null;
  const [status, name] = PG[code];
  // RLS rejections on insert/update are "permission denied" or "new row violates row-level security".
  return new HttpError(status, (e as Error).message, name);
}

/** Throws 404 when a row is missing (RLS hides rows the caller can't read). */
export function found<T>(row: T | null | undefined, what = 'Not found'): T {
  if (row == null) throw new HttpError(404, what, 'not_found');
  return row;
}
