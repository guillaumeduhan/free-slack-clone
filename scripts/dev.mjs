// One command to run the whole app: `npm run dev` (or `make`).
//   1. Uses DATABASE_URL if you set one, otherwise boots an embedded Postgres in .data/postgres
//   2. Applies migrations and the seed (workspace with #general, OWNER_EMAIL invited as owner)
//   3. Starts Next.js on http://localhost:3002, and stops Postgres again on Ctrl-C
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { EMBEDDED_PG_PORT, ownDatabase, root } from './env.mjs';

const PORT = process.env.PORT ?? '3002';

const canConnect = async (url) => {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => {});
  }
};

const run = (cmd, args) =>
  new Promise((resolve, reject) =>
    spawn(cmd, args, { cwd: root, stdio: 'inherit' }).on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`)),
    ),
  );

let embedded = null;

if (ownDatabase) {
  if (!(await canConnect(process.env.DATABASE_URL))) {
    console.error('✗ Cannot reach DATABASE_URL. Start that Postgres, or remove DATABASE_URL to use the embedded one.');
    process.exit(1);
  }
  console.log('✓ using DATABASE_URL');
} else if (await canConnect(process.env.DATABASE_URL)) {
  // A previous run is still up (e.g. killed without Ctrl-C): reuse it.
  console.log(`✓ embedded Postgres already running on port ${EMBEDDED_PG_PORT}`);
} else {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const databaseDir = join(root, '.data/postgres');
  embedded = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port: EMBEDDED_PG_PORT,
    persistent: true,
    onLog: () => {},
  });
  const fresh = !existsSync(join(databaseDir, 'PG_VERSION'));
  if (fresh) await embedded.initialise();
  await embedded.start();
  if (fresh) await embedded.createDatabase('chat');
  console.log(`✓ embedded Postgres on port ${EMBEDDED_PG_PORT} (data in .data/postgres)`);
}

try {
  await run(process.execPath, ['scripts/migrate.mjs', '--seed']);
} catch (e) {
  console.error(`✗ ${e.message}`);
  await embedded?.stop().catch(() => {});
  process.exit(1);
}

console.log(`\n  Slack clone → http://localhost:${PORT}`);
console.log(`  Sign in as ${process.env.OWNER_EMAIL}; the code shows up on the login screen in dev.\n`);

const next = spawn(join(root, 'node_modules/.bin/next'), ['dev', '-p', PORT], { cwd: root, stdio: 'inherit' });
next.on('exit', async () => {
  await embedded?.stop().catch(() => {});
  process.exit(0);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => next.kill(sig));
