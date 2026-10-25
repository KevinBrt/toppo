/**
 * Takes a snapshot of a database as this version of Toppo leaves it, for the upgrade tests: a
 * fresh database of the test server, migrated and filled by the built server through its API
 * (`fill-instance.ts`), then every row of every table written to
 * `packages/db/snapshots/<name>.json` with its last migration. The tests restore it as it was and
 * run the migrations that came after on it.
 *
 * Run `npm run db:snapshot -- <name>` (it builds the server first) with the test server up
 * (`npm run db:up`), at each release, named after the version: `npm run db:snapshot -- 0.1.0`.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { apiOf, psql as psqlIn, startServer, stopServer } from '../harness/built-server.ts';
import { fillInstance } from './fill-instance.ts';

const DATABASE = 'toppo_snapshot';
const DATABASE_URL = `postgres://toppo:toppo@127.0.0.1:54330/${DATABASE}`;
const PORT = 3201;
const SETUP_CODE = 'SNAP-SHOT-TAKE';
const OUTPUT = join(tmpdir(), 'toppo-snapshot');
const SNAPSHOTS = fileURLToPath(new URL('../../../packages/db/snapshots/', import.meta.url));
const JOURNAL = fileURLToPath(
  new URL('../../../packages/db/migrations/meta/_journal.json', import.meta.url),
);
/** Who is signed in, and how often they tried: the state of the moment, not data to upgrade. */
const LEFT_OUT = new Set(['sessions', 'verifications', 'rate_limits']);

const psql = (sql: string, database = DATABASE) => psqlIn(sql, database);
const lines = (output: string) => output.split(/\r?\n/).filter((line) => line !== '');

const name = process.argv[2] ?? '';
if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) {
  throw new Error('Name the snapshot after its version: npm run db:snapshot -- 0.1.0');
}

/** Until the jobs due are done: the notifications of what was just done arrive. */
async function waitForJobs(): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const due = psql(
      `select count(*) from jobs where status = 'pending' and run_at <= now() + interval '1 second'`,
    ).trim();
    if (due === '0') {
      return;
    }
    await sleep(200);
  }
  throw new Error('Jobs are still due after 30 seconds');
}

/** The tag of the last migration the server applied: every one of this version's. */
function lastMigration(): string {
  const journal = JSON.parse(readFileSync(JOURNAL, 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const applied = lines(
    psql('select created_at from drizzle.__drizzle_migrations order by created_at'),
  ).map(Number);
  const last = journal.entries.at(-1);
  if (!last || applied.length !== journal.entries.length || applied.at(-1) !== last.when) {
    throw new Error('The database does not have every migration of this version');
  }
  return last.tag;
}

/** Every row of `table`, the columns PostgreSQL computes left out, in the order of its key. */
function rowsOf(table: string): Record<string, unknown>[] {
  const columns = lines(
    psql(`
      select quote_ident(column_name) from information_schema.columns
      where table_schema = 'public' and table_name = '${table}' and is_generated = 'NEVER'
      order by ordinal_position
    `),
  );
  const [key] = columns;
  return JSON.parse(
    psql(`
      select coalesce(json_agg(row order by row.${key}), '[]')
      from (select ${columns.join(', ')} from ${table}) as row
    `),
  ) as Record<string, unknown>[];
}

mkdirSync(join(OUTPUT, 'data'), { recursive: true });
psql(`drop database if exists ${DATABASE} with (force)`, 'postgres');
psql(`create database ${DATABASE}`, 'postgres');
const server = await startServer({
  databaseUrl: DATABASE_URL,
  port: PORT,
  dataDir: join(OUTPUT, 'data'),
  setupCode: SETUP_CODE,
});
try {
  await fillInstance(apiOf(PORT), SETUP_CODE);
  await waitForJobs();
} finally {
  await stopServer(server);
}

const tables = lines(
  psql(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `),
).filter((table) => !LEFT_OUT.has(table));
const snapshot = {
  name,
  migration: lastMigration(),
  tables: Object.fromEntries(tables.map((table) => [table, rowsOf(table)])),
};
mkdirSync(SNAPSHOTS, { recursive: true });
const file = join(SNAPSHOTS, `${name}.json`);
writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
execSync(`npx biome format --write "${file}"`, { stdio: 'inherit' });
psql(`drop database ${DATABASE} with (force)`, 'postgres');
const rows = Object.values(snapshot.tables).reduce((total, table) => total + table.length, 0);
console.log(`${file}: ${rows} rows of ${tables.length} tables, at ${snapshot.migration}.`);
