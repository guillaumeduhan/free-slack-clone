// Shared by the scripts: loads .env.local / .env and fills the defaults `npm run dev` uses.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const root = join(import.meta.dirname, '..');
for (const f of ['.env.local', '.env']) if (existsSync(join(root, f))) process.loadEnvFile(join(root, f));

export const EMBEDDED_PG_PORT = Number(process.env.EMBEDDED_PG_PORT ?? 54329);
export const EMBEDDED_DATABASE_URL = `postgres://postgres:postgres@localhost:${EMBEDDED_PG_PORT}/chat`;

/** True when the user brought their own Postgres. */
export const ownDatabase = Boolean(process.env.DATABASE_URL);
process.env.DATABASE_URL ||= EMBEDDED_DATABASE_URL;
process.env.OWNER_EMAIL ||= 'owner@example.com';
