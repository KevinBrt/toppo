import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type Database, schema, uuidv7 } from '@toppo-tracker/db';
import { CSP_NONCE_PLACEHOLDER } from '@toppo-tracker/shared';
import { createTestDatabase } from '@toppo-tracker/testing';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll } from 'vitest';
import { buildApp, createHostCalls } from './app.ts';
import type { Actor } from './platform/auth/actor.ts';
import { createAuth } from './platform/auth/auth.ts';
import { createSecretBox } from './platform/config/secret-box.ts';
import type { ExecutionContext, Services } from './platform/cqrs/cqrs.ts';
import { createMailer } from './platform/mail/mailer.ts';
import {
  createManifestReader,
  createSettingsChecker,
} from './platform/plugins/packages/manifest-reader.ts';
import {
  createPackageStore,
  type PackageStore,
} from './platform/plugins/packages/package-store.ts';
import { createPluginRuntime } from './platform/plugins/runtime/plugin-runtime.ts';
import { createFileStorage, type FileStorage } from './platform/uploads/file-storage.ts';

export const TEST_SECRET = 'test-secret-that-is-long-enough-to-be-accepted';
export const TEST_SETUP_CODE = 'TEST-SETU-PCDE';

export interface TestAppOptions {
  /** A real database; by default, one that is never reached and whose ping succeeds. */
  database?: Database;
  ping?: () => Promise<void>;
  publicUrl?: string;
  webRoot?: string;
  /** Attached files; by default, an empty storage of its own in the temporary directory. */
  files?: FileStorage;
  /** Behind one reverse proxy, as `TOPPO_TRUST_PROXY=true` says; reached directly by default. */
  trustProxy?: boolean;
  /** Plugins' zips; by default, an empty store of its own in the temporary directory. */
  packages?: PackageStore;
}

/** The sandbox worker, run from the sources. */
export const TEST_SANDBOX_WORKER = new URL(
  './platform/plugins/sandbox/sandbox-worker.ts',
  import.meta.url,
);

/** What runs plugins in tests: their zips in `packages`, an empty store of its own by default. */
export async function testPlugins(packages?: PackageStore) {
  const store = packages ?? (await createTestPackageStore());
  return {
    packages: store,
    workerUrl: TEST_SANDBOX_WORKER,
    runtime: createPluginRuntime({ packages: store, workerUrl: TEST_SANDBOX_WORKER }),
  };
}

/** An empty store of plugins' zips, of its own, in the temporary directory. */
export function createTestPackageStore(): Promise<PackageStore> {
  return createPackageStore({ root: mkdtempSync(join(tmpdir(), 'toppo-plugins-')) });
}

/** Largest attachment in tests unless a test chooses otherwise: small, to test the limit cheaply. */
export const TEST_ATTACHMENT_MAX_SIZE = 64 * 1024;

/** An empty file storage of its own, in the temporary directory, with plenty of room. */
export function createTestFileStorage(
  options: { maxFileSize?: number; freeSpace?: () => Promise<number> } = {},
): Promise<FileStorage> {
  return createFileStorage({
    root: mkdtempSync(join(tmpdir(), 'toppo-uploads-')),
    maxFileSize: options.maxFileSize ?? TEST_ATTACHMENT_MAX_SIZE,
    freeSpace: options.freeSpace ?? (() => Promise.resolve(Number.MAX_SAFE_INTEGER)),
  });
}

export async function buildTestApp({
  database = createDatabase({ url: 'postgres://toppo:toppo@127.0.0.1:1/unused' }),
  ping,
  publicUrl = 'http://localhost:3000',
  webRoot = join(tmpdir(), 'toppo-no-web-root'),
  files,
  trustProxy = false,
  packages,
}: TestAppOptions = {}): Promise<FastifyInstance> {
  const url = new URL(publicUrl);
  return await buildApp({
    config: { publicUrl: url, logLevel: 'silent', trustProxy, updateCheck: false },
    database: { db: database.db, ping: ping ?? (() => Promise.resolve()) },
    auth: createAuth({ db: database.db, secret: TEST_SECRET, publicUrl: url }),
    secret: TEST_SECRET,
    setupCode: TEST_SETUP_CODE,
    files: files ?? (await createTestFileStorage()),
    plugins: await testPlugins(packages),
    webRoot,
  });
}

/**
 * Services for commands run directly in tests: passwords are "hashed" as themselves; no file is
 * kept unless a test gives a storage; mail goes to the server the saved settings name.
 */
export function testServices(overrides: Partial<Services> = {}): Services {
  const secrets = createSecretBox(TEST_SECRET);
  return {
    secrets,
    mailer: createMailer(secrets),
    hashPassword: (password) => Promise.resolve(password),
    setupCode: TEST_SETUP_CODE,
    publicUrl: new URL('http://localhost:3000'),
    files: {
      maxFileSize: TEST_ATTACHMENT_MAX_SIZE,
      keep: () => Promise.reject(new Error('No file storage in this test')),
    },
    // Tests never reach GitHub: a test that needs a release gives its own feed.
    releases: {
      enabled: false,
      latest: () => Promise.reject(new Error('No release feed in this test')),
    },
    // No package is kept unless a test gives a store; bundles run in a real sandbox.
    plugins: {
      packages: { keep: () => Promise.reject(new Error('No package store in this test')) },
      readManifest: createManifestReader(TEST_SANDBOX_WORKER),
      checkSettings: createSettingsChecker(TEST_SANDBOX_WORKER),
      runtime: { run: () => Promise.reject(new Error('No plugin runs in this test')) },
      calls: createHostCalls(),
    },
    ...overrides,
  };
}

/** What a command or query run directly in a test gets, as `actor` with these permissions. */
export function testExecutionContext(
  database: Database,
  actor: Pick<Actor, 'id' | 'permissions'>,
): ExecutionContext {
  return {
    db: database.db,
    actor: { name: 'Test actor', email: 'actor@example.com', pluginPermissions: [], ...actor },
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

/** Connections of this test database waiting for a row lock, e.g. one taken `for update`. */
export async function waitingForRowLocks(database: Database): Promise<number> {
  const [row] = await database.db.execute<{ count: string }>(
    sql`select count(*) as count from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
          and wait_event in ('transactionid', 'tuple')`,
  );
  return Number(row?.count);
}

/** A private, migrated database for the current test file. */
export function setupTestDatabase(): { readonly database: Database } {
  let database: Database | undefined;

  beforeAll(async () => {
    database = createDatabase({ url: (await createTestDatabase()).url, maxConnections: 4 });
  });

  afterAll(async () => {
    await database?.close();
  });

  return {
    get database() {
      if (!database) {
        throw new Error('setupTestDatabase() is only available inside tests');
      }
      return database;
    },
  };
}

export interface TestUser {
  name: string;
  email: string;
  password: string;
  instanceRoleId: string;
}

/** Adds a user who can sign in with `password`, as an accepted invitation would. Returns their id. */
export async function createTestUser(database: Database, user: TestUser): Promise<string> {
  const auth = createAuth({
    db: database.db,
    secret: TEST_SECRET,
    publicUrl: new URL('http://localhost:3000'),
  });
  const passwordHash = await (await auth.$context).password.hash(user.password);
  const id = uuidv7();
  await database.db.insert(schema.users).values({
    id,
    name: user.name,
    email: user.email,
    emailVerified: true,
    instanceRoleId: user.instanceRoleId,
  });
  await database.db.insert(schema.accounts).values({
    accountId: id,
    providerId: 'credential',
    userId: id,
    password: passwordHash,
  });
  return id;
}

/** The `name=value` pairs of a response's cookies, ready to send back in a `cookie` header. */
export function cookieHeader(response: LightMyRequestResponse): string {
  return response.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
}

/** A throwaway compiled web app: `index.html`, a hashed asset and a root file. */
export function createWebRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'toppo-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(
    join(root, 'index.html'),
    `<!doctype html><meta property="csp-nonce" nonce="${CSP_NONCE_PLACEHOLDER}"><title>Toppo</title>`,
  );
  writeFileSync(join(root, 'assets', 'app-abc123.js'), 'console.log("toppo")');
  writeFileSync(join(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
