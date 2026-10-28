import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { createEmptyTestDatabase, type TestDatabase } from './test-database.ts';

/**
 * A database as a version of Toppo left it, taken by `npm run db:snapshot`: the last migration
 * it had, and every row of its tables, the columns PostgreSQL computes left out.
 */
export interface DatabaseSnapshot {
  /** The version it comes from: `1.0.0`. */
  name: string;
  /** The tag of its last migration, `0042_issue_duplicates`. */
  migration: string;
  tables: Record<string, Record<string, unknown>[]>;
}

interface Journal {
  entries: { tag: string }[];
}

/** Every snapshot of `folder`, by name. */
export async function readSnapshots(folder: string): Promise<DatabaseSnapshot[]> {
  const files = (await readdir(folder)).filter((file) => file.endsWith('.json')).sort();
  return await Promise.all(
    files.map(
      async (file) => JSON.parse(await readFile(join(folder, file), 'utf8')) as DatabaseSnapshot,
    ),
  );
}

/**
 * A new test database holding `snapshot` as its version left it: migrated as far as it was with
 * the migrations of that time (`migrate`), then given its rows. Upgrading it is the caller's test.
 */
export async function restoreSnapshot(
  snapshot: DatabaseSnapshot,
  migrationsFolder: string,
  migrate: (url: string, migrationsFolder: string) => Promise<void>,
): Promise<TestDatabase> {
  const database = await createEmptyTestDatabase();
  const thenFolder = await migrationsUpTo(migrationsFolder, snapshot.migration);
  try {
    await migrate(database.url, thenFolder);
  } finally {
    await rm(thenFolder, { recursive: true, force: true });
  }
  const sql = postgres(database.url, { max: 1, onnotice: () => undefined });
  try {
    await sql.begin(async (tx) => {
      // The rows its migrations wrote are in the snapshot as the version left them.
      await tx`truncate table ${tx(Object.keys(snapshot.tables))} cascade`;
      // Rows go in table by table, whatever points to what: references hold once all are in.
      await tx`set local session_replication_role = replica`;
      for (const [table, rows] of Object.entries(snapshot.tables)) {
        const [first] = rows;
        if (!first) {
          continue;
        }
        const columns = Object.keys(first);
        await tx`
          insert into ${tx(table)} (${tx(columns)})
          select ${tx(columns)} from jsonb_populate_recordset(null::${tx(table)}, ${tx.json(rows as postgres.JSONValue)})
        `;
      }
    });
  } finally {
    await sql.end();
  }
  return database;
}

/** A copy of the migrations up to `tag`, as the version that ended with it shipped them. */
async function migrationsUpTo(folder: string, tag: string): Promise<string> {
  const journal = JSON.parse(
    await readFile(join(folder, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  if (last === -1) {
    throw new Error(`No migration ${tag}: a released migration is never removed`);
  }
  const entries = journal.entries.slice(0, last + 1);
  const copy = await mkdtemp(join(tmpdir(), 'toppo-migrations-'));
  await mkdir(join(copy, 'meta'));
  await Promise.all(
    entries.map((entry) =>
      copyFile(join(folder, `${entry.tag}.sql`), join(copy, `${entry.tag}.sql`)),
    ),
  );
  await writeFile(join(copy, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  return copy;
}
