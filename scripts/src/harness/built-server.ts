/**
 * What the scripts that drive a real Toppo share: the built server started on a database of the
 * test server, its API called as a browser would, and `psql` run in the database's container.
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/** The `test-db` service of docker/compose.dev.yml. */
export const TEST_DB_CONTAINER = 'toppo-dev-test-db-1';
/** Every account the scripts create signs in with it. */
export const PASSWORD = 'correct horse battery staple';
/** DEFAULT_ROLE_IDS (@toppo/core): the scripts depend on no workspace. */
export const ROLE_IDS = {
  team: '01a1569b-9801-747e-91c9-d058653f2a8e',
  requester: '01a1569b-9802-7f0a-b82f-656d1e2109c6',
} as const;

const SERVER = fileURLToPath(new URL('../../../apps/server/dist/main.js', import.meta.url));

/** Runs `sql` in `database` of the test server, and answers what it prints, unaligned. */
export function psql(sql: string, database: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      TEST_DB_CONTAINER,
      'psql',
      '-U',
      'toppo',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
    ],
    { input: sql, maxBuffer: 256 * 1024 * 1024 },
  ).toString();
}

export interface ServerOptions {
  databaseUrl: string;
  port: number;
  /** Where it keeps attached files. */
  dataDir: string;
  setupCode: string;
}

/** The built server (`apps/server/dist`), once it answers its health check. */
export async function startServer(options: ServerOptions): Promise<ChildProcess> {
  const base = baseOf(options.port);
  const server = spawn('node', [SERVER], {
    env: {
      ...process.env,
      TOPPO_DATABASE_URL: options.databaseUrl,
      TOPPO_HOST: '127.0.0.1',
      TOPPO_PORT: String(options.port),
      TOPPO_URL: base,
      TOPPO_LOG_LEVEL: 'error',
      TOPPO_DATA_DIR: options.dataDir,
      TOPPO_SETUP_CODE: options.setupCode,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const healthy = await fetch(`${base}/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (healthy) {
      return server;
    }
    await sleep(200);
  }
  throw new Error('The server did not start');
}

export async function stopServer(server: ChildProcess): Promise<void> {
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
}

const baseOf = (port: number) => `http://127.0.0.1:${port}`;

export interface CallOptions {
  cookie?: string;
  /** Sent as JSON. */
  body?: object;
  /** Sent as is, with these headers: a file. */
  raw?: { data: Uint8Array; headers: Record<string, string> };
}

/** The API of the server on `port`, called as the browser does; any refusal throws. */
export function apiOf(port: number) {
  const base = baseOf(port);

  async function call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    { cookie, body, raw }: CallOptions = {},
  ): Promise<Response> {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        origin: base,
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...raw?.headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(raw ? { body: raw.data } : {}),
    });
    if (!response.ok) {
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    }
    return response;
  }

  async function signIn(email: string): Promise<string> {
    const response = await call('POST', '/api/auth/sign-in/email', {
      body: { email, password: PASSWORD },
    });
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }

  return { call, signIn };
}

/** The token of the one invitation link `POST /api/v1/invitations` answered. */
export function invitationToken(answer: unknown): string {
  const invitations =
    typeof answer === 'object' && answer !== null && 'invitations' in answer
      ? answer.invitations
      : null;
  const [first] = Array.isArray(invitations) ? invitations : [];
  const link: unknown =
    typeof first === 'object' && first !== null && 'link' in first ? first.link : null;
  const token = typeof link === 'string' ? link.split('#')[1] : undefined;
  if (!token) {
    throw new Error('No invitation link');
  }
  return token;
}
