import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';

// int8 (message ids, counts) → number. Ids stay far below 2^53.
types.setTypeParser(20, (v) => Number(v));

const globalForPool = globalThis as unknown as { chatPool?: Pool };

/** The only external dependency of the API: one Postgres pool (DATABASE_URL). */
export const pool =
  globalForPool.chatPool ??
  (globalForPool.chatPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  }));

export type Tx = {
  /** All rows. */
  many<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  /** First row or null. */
  maybe<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Number of affected rows. */
  exec(sql: string, params?: unknown[]): Promise<number>;
};

const wrap = (c: PoolClient): Tx => ({
  many: async (sql, params) => (await c.query(sql, params)).rows,
  maybe: async (sql, params) => (await c.query(sql, params)).rows[0] ?? null,
  exec: async (sql, params) => (await c.query(sql, params)).rowCount ?? 0,
});

async function transaction<T>(setup: (c: PoolClient) => Promise<unknown>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await setup(c);
    const out = await fn(wrap(c));
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Runs as the signed-in user: role chat_user + chat.uid() = uid,
 * so row-level security and the SQL functions apply.
 */
export function asUser<T>(uid: string, fn: (tx: Tx) => Promise<T>) {
  return transaction(async (c) => {
    await c.query('set local role chat_user');
    await c.query(`select set_config('chat.uid', $1, true), set_config('search_path', 'chat, public', true)`, [uid]);
  }, fn);
}

/** Bypasses RLS (the pool's login role). Server only: auth, bot API, webhooks. */
export function asServer<T>(fn: (tx: Tx) => Promise<T>) {
  return transaction((c) => c.query(`select set_config('search_path', 'chat, public', true)`), fn);
}
