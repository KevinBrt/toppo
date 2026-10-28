import { randomBytes } from 'node:crypto';
import { inject } from 'vitest';
import { testDatabaseUrl } from './database-url.ts';
import {
  createDatabase,
  dropDatabases,
  ensurePostgres,
  withMaintenanceConnection,
} from './postgres-server.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Name of the migrated template database prepared by the global setup. */
    testTemplateDatabase: string;
  }
}

export interface TemplateOptions {
  /** Unique per package, so suites of different packages can run in parallel. */
  name: string;
  /** Brings an empty database at `url` to the current schema. */
  migrate: (url: string) => Promise<void>;
}

/**
 * Called once per test run from a Vitest global setup: (re)creates a template database with the
 * current schema and removes clones left over by interrupted runs. The global setup hands
 * `removeTestDatabases(name)` back as its teardown.
 */
export async function prepareTemplateDatabase({ name, migrate }: TemplateOptions): Promise<string> {
  await ensurePostgres();
  await removeTestDatabases(name);
  await createDatabase(name);
  await migrate(testDatabaseUrl(name));
  return name;
}

/**
 * Drops the template `name` and its clones: once every test file of a run is done, and before
 * the next run in case one was interrupted. Never while files still run: dropping a database
 * waits for a checkpoint, which takes seconds while the other files write.
 */
export async function removeTestDatabases(name: string): Promise<void> {
  const databases = await withMaintenanceConnection(
    (sql) => sql<{ datname: string }[]>`
      select datname from pg_database where datname like ${`${name}\\_%`} or datname = ${name}
    `,
  );
  await dropDatabases(databases.map(({ datname }) => datname));
}

export interface TestDatabase {
  name: string;
  url: string;
}

/**
 * A private database for one test file, cloned from the migrated template: tests run in
 * parallel against a real PostgreSQL without seeing each other's data. It stays until the end of
 * the run, when `removeTestDatabases()` drops it with the others.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  return await createNamedDatabase('clone', inject('testTemplateDatabase'));
}

/** An empty database without schema, to test migrations themselves. */
export async function createEmptyTestDatabase(): Promise<TestDatabase> {
  return await createNamedDatabase('empty');
}

async function createNamedDatabase(kind: string, template?: string): Promise<TestDatabase> {
  const name = `${inject('testTemplateDatabase')}_${kind}_${randomBytes(6).toString('hex')}`;
  await createDatabase(name, template);
  return { name, url: testDatabaseUrl(name) };
}
