// Applies db/migrations/*.sql in order (once each), then optionally db/seed.sql.
//   node scripts/migrate.mjs            migrate
//   node scripts/migrate.mjs --seed     migrate + seed (WORKSPACE_NAME with #general, OWNER_EMAIL invited as owner)
//   node scripts/migrate.mjs --reset    drop the "chat" schema first
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { root } from './env.mjs';

const url = process.env.DATABASE_URL;
const args = new Set(process.argv.slice(2));
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  if (args.has('--reset')) {
    await client.query('drop schema if exists chat cascade');
    console.log('✓ dropped schema chat');
  }
  await client.query(`create schema if not exists chat;
    create table if not exists chat._migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query('select name from chat._migrations')).rows.map((r) => r.name));

  const dir = join(root, 'db/migrations');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    await client.query(readFileSync(join(dir, name), 'utf8'));
    await client.query('insert into chat._migrations (name) values ($1)', [name]);
    console.log(`✓ ${name}`);
  }
  // chat_user must never read the bookkeeping table.
  await client.query('revoke all on chat._migrations from chat_user');

  if (args.has('--seed')) {
    const owner = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
    const workspace = (process.env.WORKSPACE_NAME ?? 'Default Workspace').trim() || 'Default Workspace';
    await client.query(`select set_config('chat.seed_owner_email', $1, false), set_config('chat.seed_workspace', $2, false)`, [owner, workspace]);
    await client.query(readFileSync(join(root, 'db/seed.sql'), 'utf8'));
    console.log(`✓ seed${owner ? ` (owner invite: ${owner})` : ' (no OWNER_EMAIL, owner not invited)'}`);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
