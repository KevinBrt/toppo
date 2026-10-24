/**
 * Checks the plans of the issue list and search on a database of realistic size
 * (docs/performance.md): seeds 100,000 issues on the test server, replays the screens' requests
 * against the built server, and reports each request's time and the plans PostgreSQL ran.
 *
 * Run `npm run perf:issues` (it builds the server first) with the test server up
 * (`npm run db:up`). `--reuse` keeps the database of an earlier run instead of seeding again.
 */
import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/** The `test-db` service of docker/compose.dev.yml. */
const CONTAINER = 'toppo-dev-test-db-1';
const DATABASE_URL = 'postgres://toppo:toppo@127.0.0.1:54330/toppo_perf';
const DATABASE = 'toppo_perf';
const PORT = 3200;
const BASE = `http://127.0.0.1:${PORT}`;
const SETUP_CODE = 'PERF-CHEC-KRUN';
const PASSWORD = 'correct horse battery staple';
/** DEFAULT_ROLE_IDS.team (@toppo/core). */
const TEAM_ROLE = '01a1569b-9801-747e-91c9-d058653f2a8e';
const SERVER = fileURLToPath(new URL('../../../apps/server/dist/main.js', import.meta.url));
const SEED = fileURLToPath(new URL('./seed-issues.sql', import.meta.url));
const OUTPUT = join(tmpdir(), 'toppo-perf');

/** auto_explain on every new session of the database: each query planned, run and logged. */
const EXPLAIN_ALL = `
  alter database ${DATABASE} set session_preload_libraries = 'auto_explain';
  alter database ${DATABASE} set auto_explain.log_min_duration = 0;
  alter database ${DATABASE} set auto_explain.log_analyze = on;
  alter database ${DATABASE} set auto_explain.log_buffers = on;
`;

function psql(sql: string, database = DATABASE): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-U',
      'toppo',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
    ],
    { input: sql, maxBuffer: 64 * 1024 * 1024 },
  ).toString();
}

async function startServer(): Promise<ChildProcess> {
  const server = spawn('node', [SERVER], {
    env: {
      ...process.env,
      TOPPO_DATABASE_URL: DATABASE_URL,
      TOPPO_HOST: '127.0.0.1',
      TOPPO_PORT: String(PORT),
      TOPPO_URL: BASE,
      TOPPO_LOG_LEVEL: 'error',
      TOPPO_DATA_DIR: join(OUTPUT, 'data'),
      TOPPO_SETUP_CODE: SETUP_CODE,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const healthy = await fetch(`${BASE}/health`).then(
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

async function stopServer(server: ChildProcess): Promise<void> {
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  { cookie, body }: { cookie?: string; body?: object } = {},
): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: BASE,
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

/** The token of the one invitation link `POST /api/v1/invitations` answered. */
function invitationToken(answer: unknown): string {
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

/** A fresh database: migrated by the server, set up by Ada, with Grace invited, then seeded. */
async function seed(): Promise<void> {
  psql(`drop database if exists ${DATABASE} with (force)`, 'postgres');
  psql(`create database ${DATABASE}`, 'postgres');
  const server = await startServer();
  await call('POST', '/api/v1/setup', {
    body: {
      setupCode: SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  const admin = await signIn('ada@example.com');
  const invited = await call('POST', '/api/v1/invitations', {
    cookie: admin,
    body: { emails: ['grace@example.com'], roleId: TEAM_ROLE },
  });
  await call('POST', '/api/v1/invitations/accept', {
    body: {
      token: invitationToken(await invited.json()),
      name: 'Grace Hopper',
      password: PASSWORD,
    },
  });
  await stopServer(server);

  const started = performance.now();
  psql(readFileSync(SEED, 'utf8'));
  // Grace works in ten projects, the large one among them, with about 300 issues of her own.
  psql(`
    insert into project_members (id, project_id, user_id)
      select uuidv7(), p.id, u.id from projects p, users u
      where u.email = 'grace@example.com' and (p.key in ('BIG', 'MID') or p.key between 'P01' and 'P08');
    update issues set assignee_id = (select id from users where email = 'grace@example.com')
      where id in (select id from issues tablesample bernoulli (0.3));
    vacuum analyze issues;
  `);
  console.log(`Seeded in ${((performance.now() - started) / 1000).toFixed(0)} s:`);
  console.log(
    psql(`
      select count(*) || ' issues' from issues;
      select pg_size_pretty(pg_total_relation_size('issues')) || ' for the issues table';
    `),
  );
}

/** The requests of the list and the search, as the screens send them. */
function requests(admin: string, member: string): [label: string, cookie: string, path: string][] {
  const somebody = psql(`select id from users where email = 'person7@example.com'`).trim();
  const list = '/api/v1/projects/BIG/issues';
  const property = (name: string) =>
    psql(`select id from properties where name = '${name}'`).trim();
  const option = (name: string) =>
    psql(`select id from property_options where name = '${name}'`).trim();
  const day = (offset: number) =>
    new Date(Date.now() + offset * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const filtered = (filter: string) => `${list}?state=open&property=${filter}`;
  return [
    ['admin: list, open, newest', admin, `${list}?state=open`],
    ['admin: list, all, page 300', admin, `${list}?page=300`],
    ['admin: list, last updated', admin, `${list}?state=open&sort=updated`],
    ['admin: list, by title, page 20', admin, `${list}?state=open&sort=title&page=20`],
    ['admin: list, by assignee', admin, `${list}?state=open&sort=assignee`],
    ['admin: list, grouped by status', admin, `${list}?state=open&group=status&sort=priority`],
    ['admin: list, one assignee', admin, `${list}?state=open&assignee=${somebody}`],
    ['admin: list, search a common word', admin, `${list}?search=erreur`],
    ['admin: list, search a rarer word', admin, `${list}?search=facture`],
    ['admin: list, search an error code', admin, `${list}?search=E4821`],
    ['admin: list, search inside words', admin, `${list}?state=open&search=chargem`],
    ['admin: list, search a key', admin, `${list}?state=open&search=BIG-12345`],
    ['admin: list, one version', admin, filtered(`${property('Version')}:${option('1.3')}`)],
    ['admin: list, no version', admin, filtered(`${property('Version')}:none`)],
    ['admin: list, one platform', admin, filtered(`${property('Platforms')}:${option('Android')}`)],
    [
      'admin: list, due within a month',
      admin,
      filtered(`${property('Due')}:${day(0)}..${day(30)}`),
    ],
    ['admin: list, estimate 3 to 5', admin, filtered(`${property('Estimate')}:3..5`)],
    ['admin: list, blocking', admin, filtered(`${property('Blocking')}:yes`)],
    [
      'admin: list, version and platform',
      admin,
      filtered(`${property('Version')}:${option('1.3')};${property('Platforms')}:${option('iOS')}`),
    ],
    ['admin: list, small project', admin, '/api/v1/projects/P05/issues?state=open'],
    ['admin: palette, a common word', admin, '/api/v1/issues/search?search=erreur'],
    ['admin: palette, a rarer word', admin, '/api/v1/issues/search?search=paiement'],
    ['admin: palette, an error code', admin, '/api/v1/issues/search?search=E4821'],
    ['admin: palette, a key', admin, '/api/v1/issues/search?search=MID-777'],
    ['member: list, open, newest', member, `${list}?state=open`],
    ['member: list, mine', member, `${list}?state=open&assignee=me`],
    ['member: palette, a common word', member, '/api/v1/issues/search?search=erreur'],
    ['member: palette, two words', member, '/api/v1/issues/search?search=export%20vide'],
    ['member: my issues', member, '/api/v1/issues/assigned'],
  ];
}

/**
 * The plans of each request's issue queries, from the log auto_explain wrote: a `MARK` query
 * before each request tells where it starts; of its two runs, the second's plans count.
 */
function planReport(log: string): string {
  const entries: { duration: number; lines: string[] }[] = [];
  for (const line of log.split(/\r?\n/)) {
    const head = /LOG: {2}duration: ([\d.]+) ms {2}plan:/.exec(line);
    if (head) {
      entries.push({ duration: Number(head[1]), lines: [] });
    } else if (!/ (LOG|ERROR|WARNING|STATEMENT): /.test(line)) {
      entries.at(-1)?.lines.push(line);
    }
  }
  const report: string[] = [];
  let seen = new Set<string>();
  for (const { duration, lines } of entries) {
    const text = (lines.find((line) => line.includes('Query Text:')) ?? '').replace(
      /^\s*Query Text:\s*/,
      '',
    );
    const mark = /^select 'MARK (.+)'/.exec(text);
    if (mark) {
      report.push(`\n=== ${mark[1]}`);
      seen = new Set();
    } else if (text.includes('"issues"')) {
      const query = text.slice(0, 100);
      if (seen.has(query)) {
        report.push(`--- ${duration.toFixed(1)} ms  ${query}…`);
        report.push(...lines.filter((line) => /Scan|Sort |Limit|Aggregate|Gather/.test(line)));
      }
      seen.add(query);
    }
  }
  return report.join('\n');
}

mkdirSync(join(OUTPUT, 'data'), { recursive: true });
if (!process.argv.includes('--reuse')) {
  await seed();
}

psql(EXPLAIN_ALL);
let server = await startServer();
const admin = await signIn('ada@example.com');
const member = await signIn('grace@example.com');
const replayed = requests(admin, member);

const since = new Date(Date.now() - 1000).toISOString();
for (const [label, cookie, path] of replayed) {
  psql(`select 'MARK ${label}'`);
  await call('GET', path, { cookie });
  await call('GET', path, { cookie });
}
psql(`select 'MARK end'`);
await stopServer(server);
const logs = spawnSync('docker', ['logs', '--since', since, CONTAINER], {
  maxBuffer: 256 * 1024 * 1024,
});
const log = Buffer.concat([logs.stdout, logs.stderr]).toString();
writeFileSync(join(OUTPUT, 'postgres.log'), log);
writeFileSync(join(OUTPUT, 'plans.txt'), planReport(log));

// The times, without auto_explain weighing on every query: the best of five round trips.
psql(`alter database ${DATABASE} reset all`);
server = await startServer();
console.log('Round trips, best of five:');
for (const [label, cookie, path] of replayed) {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    await call('GET', path, { cookie });
    best = Math.min(best, performance.now() - started);
  }
  console.log(`${best.toFixed(0).padStart(6)} ms  ${label}`);
}
await stopServer(server);
console.log(`\nPlans: ${join(OUTPUT, 'plans.txt')}`);
