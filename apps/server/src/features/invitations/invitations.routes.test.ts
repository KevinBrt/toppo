import { DEFAULT_ROLE_IDS } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  apiErrorSchema,
  createInvitationsResponseSchema,
  invitationLinkSchema,
  membersResponseSchema,
} from '@toppo/shared';
import { startSmtpServer, type TestSmtpServer } from '@toppo/testing';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJobs } from '../../app.ts';
import { runNextJob, type WorkerContext } from '../../platform/jobs/job-worker.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testServices,
} from '../../test-helpers.ts';
import { hashInvitationToken } from './utils/invitation-token.util.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const ADMIN = { name: 'Ada Lovelace', email: 'ada@example.com' };

function asAdmin(method: 'GET' | 'POST' | 'DELETE', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie: adminCookie },
    ...(body ? { body } : {}),
  });
}

/** Anyone holding a link, signed in or not. */
function asVisitor(url: string, body: object) {
  return app.inject({ method: 'POST', url, headers: { origin: ORIGIN }, body });
}

async function invite(emails: string[], roleId: string = DEFAULT_ROLE_IDS.team) {
  const response = await asAdmin('POST', '/api/v1/invitations', { emails, roleId });
  expect(response.statusCode).toBe(201);
  return createInvitationsResponseSchema.parse(response.json());
}

const tokenOf = (link: string) => new URL(link).hash.slice(1);
const errorCode = (response: { json: () => unknown }) =>
  apiErrorSchema.parse(response.json()).error.code;

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: { setupCode: TEST_SETUP_CODE, admin: { ...ADMIN, password: PASSWORD } },
  });
  expect(setup.statusCode).toBe(201);
  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email: ADMIN.email, password: PASSWORD },
  });
  adminCookie = cookieHeader(signIn);
  return () => app.close();
});

describe('inviting members', () => {
  it('gives one link per new address and leaves members out', async () => {
    const { invitations, alreadyMembers } = await invite([
      'Grace@Example.com',
      'grace@example.com',
      ADMIN.email,
      'alan@example.com',
    ]);

    expect(invitations.map(({ email }) => email)).toStrictEqual([
      'grace@example.com',
      'alan@example.com',
    ]);
    expect(alreadyMembers).toStrictEqual([ADMIN.email]);
    for (const { link } of invitations) {
      expect(link).toMatch(/^http:\/\/localhost:3000\/invitation#[A-Za-z0-9_-]{43}$/);
    }
  });

  it('stores a hash of the token, never the token', async () => {
    const [invitation] = (await invite(['hash@example.com'])).invitations;
    const token = tokenOf(invitation?.link ?? '');
    const [row] = await context.database.db
      .select({ tokenHash: schema.invitations.tokenHash })
      .from(schema.invitations)
      .where(eq(schema.invitations.email, 'hash@example.com'));

    expect(row?.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('lists pending invitations among the members, never with their link', async () => {
    const response = await asAdmin('GET', '/api/v1/members?search=grace@example.com');

    expect(response.statusCode).toBe(200);
    const { rows } = membersResponseSchema.parse(response.json());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'invitation',
      email: 'grace@example.com',
      role: { id: DEFAULT_ROLE_IDS.team, name: 'Team', color: 'green' },
      invitedBy: ADMIN.name,
    });
    expect(Object.keys(response.json().rows[0]).sort()).toStrictEqual([
      'email',
      'expiresAt',
      'id',
      'invitedBy',
      'role',
      'type',
    ]);
  });

  it('refuses a role that does not exist', async () => {
    const response = await asAdmin('POST', '/api/v1/invitations', {
      emails: ['nobody@example.com'],
      roleId: '01a1569b-9900-7000-8000-00000000dead',
    });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('INVALID_ROLE');
  });

  it('replaces the pending invitation of an address invited again', async () => {
    const [first] = (await invite(['twice@example.com'])).invitations;
    const [second] = (await invite(['twice@example.com'], DEFAULT_ROLE_IDS.requester)).invitations;

    const old = await asVisitor('/api/v1/invitations/preview', {
      token: tokenOf(first?.link ?? ''),
    });
    const latest = await asVisitor('/api/v1/invitations/preview', {
      token: tokenOf(second?.link ?? ''),
    });
    expect(errorCode(old)).toBe('INVITATION_INVALID');
    expect(latest.statusCode).toBe(200);
  });
});

describe('accepting an invitation', () => {
  it('shows whom the link is for, then creates the account with the invited role and language', async () => {
    const [invitation] = (await invite(['joan@example.com'], DEFAULT_ROLE_IDS.requester))
      .invitations;
    const token = tokenOf(invitation?.link ?? '');

    const preview = await asVisitor('/api/v1/invitations/preview', { token });
    expect(preview.json()).toStrictEqual({ email: 'joan@example.com', invitedBy: ADMIN.name });

    const accepted = await asVisitor('/api/v1/invitations/accept', {
      token,
      name: 'Joan Clarke',
      password: PASSWORD,
      locale: 'fr',
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toStrictEqual({ email: 'joan@example.com' });

    const [user] = await context.database.db
      .select({
        name: schema.users.name,
        roleId: schema.users.instanceRoleId,
        locale: schema.users.locale,
      })
      .from(schema.users)
      .where(eq(schema.users.email, 'joan@example.com'));
    expect(user).toStrictEqual({
      name: 'Joan Clarke',
      roleId: DEFAULT_ROLE_IDS.requester,
      locale: 'fr',
    });

    const signIn = await asVisitor('/api/auth/sign-in/email', {
      email: 'joan@example.com',
      password: PASSWORD,
    });
    expect(signIn.statusCode).toBe(200);
  });

  it('works once', async () => {
    const [invitation] = (await invite(['once@example.com'])).invitations;
    const body = { token: tokenOf(invitation?.link ?? ''), name: 'Once', password: PASSWORD };

    expect((await asVisitor('/api/v1/invitations/accept', body)).statusCode).toBe(201);
    const again = await asVisitor('/api/v1/invitations/accept', body);
    expect(again.statusCode).toBe(404);
    expect(errorCode(again)).toBe('INVITATION_INVALID');
  });

  it('refuses an expired link, until it is renewed', async () => {
    const [invitation] = (await invite(['late@example.com'])).invitations;
    await context.database.db
      .update(schema.invitations)
      .set({ createdAt: new Date('2026-01-01'), expiresAt: new Date('2026-01-08') })
      .where(eq(schema.invitations.email, 'late@example.com'));
    const expired = await asVisitor('/api/v1/invitations/preview', {
      token: tokenOf(invitation?.link ?? ''),
    });
    expect(expired.statusCode).toBe(410);
    expect(errorCode(expired)).toBe('INVITATION_EXPIRED');

    const renewed = await asAdmin('POST', `/api/v1/invitations/${invitation?.id}/renew`);
    expect(renewed.statusCode).toBe(200);
    const { link } = invitationLinkSchema.parse(renewed.json());

    expect(
      (await asVisitor('/api/v1/invitations/preview', { token: tokenOf(link) })).statusCode,
    ).toBe(200);
    expect(
      (await asVisitor('/api/v1/invitations/preview', { token: tokenOf(invitation?.link ?? '') }))
        .statusCode,
    ).toBe(404);
  });

  it('refuses a malformed token or a weak password before looking anything up', async () => {
    const malformed = await asVisitor('/api/v1/invitations/preview', { token: 'not-a-token' });
    const weak = await asVisitor('/api/v1/invitations/accept', {
      token: 'a'.repeat(43),
      name: 'Weak',
      password: 'short',
    });

    expect(malformed.statusCode).toBe(400);
    expect(weak.statusCode).toBe(400);
  });
});

describe('revoking an invitation', () => {
  it('kills its link at once', async () => {
    const [invitation] = (await invite(['revoked@example.com'])).invitations;

    const revoked = await asAdmin('DELETE', `/api/v1/invitations/${invitation?.id}`);
    expect(revoked.statusCode).toBe(204);

    const preview = await asVisitor('/api/v1/invitations/preview', {
      token: tokenOf(invitation?.link ?? ''),
    });
    expect(preview.statusCode).toBe(404);
    expect((await asAdmin('DELETE', `/api/v1/invitations/${invitation?.id}`)).statusCode).toBe(404);
  });
});

describe('the projects an invitation gives', () => {
  it('must exist', async () => {
    const response = await asAdmin('POST', '/api/v1/invitations', {
      emails: ['lost@example.com'],
      roleId: DEFAULT_ROLE_IDS.team,
      projectKeys: ['NOWHERE'],
    });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('INVALID_PROJECT');
  });
});

describe('emailing invitations', () => {
  let mailServer: TestSmtpServer;
  let worker: WorkerContext;

  /** Runs every job due: the emails of what was just done leave. */
  async function deliver(): Promise<void> {
    while (await runNextJob(worker)) {
      // Until none is due.
    }
  }

  const mailsTo = (address: string) => mailServer.received.filter(({ to }) => to.includes(address));

  beforeAll(async () => {
    mailServer = await startSmtpServer();
    worker = {
      db: context.database.db,
      jobs: createJobs({ files: await createTestFileStorage() }),
      log: app.log,
      services: testServices(),
    };
    await context.database.db.insert(schema.mailSettings).values({
      host: '127.0.0.1',
      port: mailServer.port,
      security: 'none',
      fromAddress: 'toppo@example.com',
      fromName: 'Toppo',
    });
  });

  afterAll(async () => {
    await context.database.db.delete(schema.mailSettings);
    await mailServer.close();
  });

  it('sends each link, in the words of whoever invites', async () => {
    const [invitation] = (await invite(['emailed@example.com'])).invitations;
    expect(invitation?.emailed).toBe(true);

    await deliver();

    const [mail] = mailsTo('emailed@example.com');
    expect(mail?.subject).toBe('Ada Lovelace invited you to Toppo');
    expect(mail?.content).toContain(invitation?.link);
    expect(mail?.content).toContain('The link works once, for 7 days.');
  });

  it('sends only the link that replaced another before it left', async () => {
    const [first] = (await invite(['renewed@example.com'])).invitations;
    const renewed = await asAdmin('POST', `/api/v1/invitations/${first?.id}/renew`);
    expect(renewed.statusCode).toBe(200);
    const { link, emailed } = invitationLinkSchema.parse(renewed.json());

    await deliver();

    expect(emailed).toBe(true);
    expect(
      mailsTo('renewed@example.com').map(({ content }) => content.includes(link)),
    ).toStrictEqual([true]);
  });

  it('leaves the links to pass on by hand once email is off', async () => {
    await context.database.db.delete(schema.mailSettings);
    const [invitation] = (await invite(['by-hand@example.com'])).invitations;

    await deliver();

    expect(invitation?.emailed).toBe(false);
    expect(mailsTo('by-hand@example.com')).toStrictEqual([]);
  });
});
