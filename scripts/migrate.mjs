// Applies db/migrations/*.sql in order (once each), then optionally db/seed.sql.
//   node scripts/migrate.mjs            migrate
//   node scripts/migrate.mjs --seed     migrate + seed (OWNER_EMAIL is invited as owner)
//   node scripts/migrate.mjs --reset    drop the "chat" schema first
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const root = join(import.meta.dirname, '..');
for (const f of ['.env.local', '.env']) if (existsSync(join(root, f))) process.loadEnvFile(join(root, f));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see .env.example).');
  process.exit(1);
}
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
    await client.query(`select set_config('chat.seed_owner_email', $1, false)`, [owner]);
    await client.query(readFileSync(join(root, 'db/seed.sql'), 'utf8'));
    console.log(`✓ seed${owner ? ` (owner invite: ${owner})` : ' (no OWNER_EMAIL, owner not invited)'}`);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
