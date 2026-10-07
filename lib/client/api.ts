/** Client-side fetch wrapper for the { ok, data } / { ok, error } API shape. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? 'Something went wrong');
  }
  return json.data as T;
}
