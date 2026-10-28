import { mkdtempSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  ATTACHMENTS_MAX,
  addAttachmentResponseSchema,
  addCommentResponseSchema,
  apiErrorSchema,
  attachmentLimitsResponseSchema,
  createIssueResponseSchema,
  FILE_NAME_HEADER,
  issueActivitiesResponseSchema,
  issueAttachmentsResponseSchema,
} from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createJobs } from '../../app.ts';
import { runNextJob } from '../../platform/jobs/job-worker.ts';
import { scheduleRecurringJobs } from '../../platform/jobs/jobs.ts';
import { createFileStorage, type FileStorage } from '../../platform/uploads/file-storage.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_ATTACHMENT_MAX_SIZE,
  TEST_SETUP_CODE,
  testServices,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let files: FileStorage;
let filesRoot: string;
/** The administrator: edits every issue, moderates comments. */
let adminCookie: string;
/** Team: edits every issue. */
let graceCookie: string;
let alanCookie: string;
/** Requester: sees and attaches files to the issues they reported. */
let ritaCookie: string;
/** Reads every issue, changes none. */
let readerCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  Buffer.from('IHDR'),
  Buffer.alloc(48, 7),
]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const CSV = 'Numéro;Montant\n1;12,50\n';

function call(method: 'GET' | 'POST' | 'DELETE', url: string, cookie: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(body ? { body } : {}),
  });
}

interface UploadOptions {
  commentId?: string;
  headers?: Record<string, string>;
}

/** Sends one file as the web app does: its bytes as the body, its name in a header. */
function upload(
  issueKey: string,
  cookie: string,
  name: string,
  content: Buffer | string | Readable,
  { commentId, headers = {} }: UploadOptions = {},
) {
  const place = commentId === undefined ? '' : `/comments/${commentId}`;
  return app.inject({
    method: 'POST',
    url: `/api/v1/issues/${issueKey}${place}/attachments`,
    headers: {
      origin: ORIGIN,
      cookie,
      'content-type': 'application/octet-stream',
      [FILE_NAME_HEADER]: encodeURIComponent(name),
      ...headers,
    },
    payload: content,
  });
}

async function attach(
  issueKey: string,
  cookie: string,
  name: string,
  content: Buffer | string,
  options: UploadOptions = {},
): Promise<string> {
  const response = await upload(issueKey, cookie, name, content, options);
  expect(response.statusCode, response.body).toBe(201);
  return addAttachmentResponseSchema.parse(response.json()).id;
}

const errorCode = (response: LightMyRequestResponse) =>
  apiErrorSchema.parse(response.json()).error.code;

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return cookieHeader(response);
}

async function report(projectKey: string, cookie: string): Promise<string> {
  const response = await call('POST', `/api/v1/projects/${projectKey}/issues`, cookie, {
    title: 'Empty CSV export',
  });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function comment(issueKey: string, cookie: string): Promise<string> {
  const response = await call('POST', `/api/v1/issues/${issueKey}/comments`, cookie, {
    body: 'Here is what I see.',
  });
  expect(response.statusCode).toBe(201);
  return addCommentResponseSchema.parse(response.json()).id;
}

async function filesOf(issueKey: string, cookie = adminCookie) {
  const response = await call('GET', `/api/v1/issues/${issueKey}/attachments`, cookie);
  expect(response.statusCode).toBe(200);
  return issueAttachmentsResponseSchema.parse(response.json()).rows;
}

async function history(issueKey: string, cookie = adminCookie) {
  const response = await call('GET', `/api/v1/issues/${issueKey}/activities`, cookie);
  expect(response.statusCode).toBe(200);
  return issueActivitiesResponseSchema.parse(response.json()).rows;
}

const download = (issueKey: string, id: string, cookie = adminCookie) =>
  call('GET', `/api/v1/issues/${issueKey}/attachments/${id}/download`, cookie);

const preview = (issueKey: string, id: string, cookie = adminCookie) =>
  call('GET', `/api/v1/issues/${issueKey}/attachments/${id}/preview`, cookie);

const remove = (issueKey: string, id: string, cookie: string) =>
  call('DELETE', `/api/v1/issues/${issueKey}/attachments/${id}`, cookie);

/** Every file on disk, as if written over an hour ago: what the sweep may remove. */
function ageEveryFile(): void {
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  for (const folder of readdirSync(filesRoot)) {
    for (const name of readdirSync(join(filesRoot, folder))) {
      utimesSync(join(filesRoot, folder, name), old, old);
    }
  }
}

beforeAll(async () => {
  filesRoot = mkdtempSync(join(tmpdir(), 'toppo-attachments-'));
  files = await createFileStorage({
    root: filesRoot,
    maxFileSize: TEST_ATTACHMENT_MAX_SIZE,
    freeSpace: () => Promise.resolve(Number.MAX_SAFE_INTEGER),
  });
  app = await buildTestApp({ database: context.database, files });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  const [reader] = await context.database.db
    .insert(schema.roles)
    .values({ name: 'Reader', permissions: ['issue.read'] })
    .returning({ id: schema.roles.id });
  const person = (name: string, email: string, instanceRoleId: string) =>
    createTestUser(context.database, { name, email, password: PASSWORD, instanceRoleId });
  const members = [
    await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team),
    await person('Alan Turing', 'alan@example.com', DEFAULT_ROLE_IDS.team),
    await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester),
    await person('Rob Reader', 'rob@example.com', reader?.id ?? ''),
  ];
  adminCookie = await signIn('ada@example.com');
  graceCookie = await signIn('grace@example.com');
  alanCookie = await signIn('alan@example.com');
  ritaCookie = await signIn('rita@example.com');
  readerCookie = await signIn('rob@example.com');
  for (const key of ['WEB', 'OLD']) {
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key, name: key })).statusCode,
    ).toBe(201);
    const added = await call('POST', `/api/v1/projects/${key}/members`, adminCookie, {
      userIds: members,
      roleId: null,
    });
    expect(added.statusCode).toBe(204);
  }
  return () => app.close();
});

describe('attaching files to an issue', () => {
  it('lists the files of its request, oldest first, with what each reader may do', async () => {
    const key = await report('WEB', ritaCookie);
    const capture = await attach(key, ritaCookie, 'capture-export.png', PNG);
    const csv = await attach(key, graceCookie, 'export-commandes.csv', CSV);

    expect(await filesOf(key, ritaCookie)).toStrictEqual([
      {
        id: capture,
        fileName: 'capture-export.png',
        mediaType: 'image/png',
        size: PNG.length,
        actions: ['delete'],
      },
      {
        id: csv,
        fileName: 'export-commandes.csv',
        mediaType: 'text/csv',
        size: Buffer.byteLength(CSV),
        actions: [],
      },
    ]);
    expect((await filesOf(key, alanCookie)).map(({ actions }) => actions)).toStrictEqual([
      ['delete'],
      ['delete'],
    ]);
    expect((await filesOf(key, readerCookie)).map(({ actions }) => actions)).toStrictEqual([
      [],
      [],
    ]);
  });

  it('tells it in the history, newest first, while the file is there', async () => {
    const key = await report('WEB', ritaCookie);
    const id = await attach(key, ritaCookie, 'facture.pdf', PDF);

    const [added] = await history(key, ritaCookie);
    expect(added).toMatchObject({
      type: 'issue.attachmentAdded',
      actor: { name: 'Rita Client' },
      payload: { attachment: { id, fileName: 'facture.pdf', actions: ['delete'] } },
    });
  });

  it('lets only whoever may change the issue’s words attach files to it', async () => {
    const key = await report('WEB', ritaCookie);
    const refused = await upload(key, readerCookie, 'notes.txt', 'Seen it too.');

    expect(refused.statusCode).toBe(403);
    expect(errorCode(refused)).toBe('FORBIDDEN');
    expect((await upload(key, alanCookie, 'notes.txt', 'Logs attached.')).statusCode).toBe(201);
    const hidden = await upload(await report('WEB', graceCookie), ritaCookie, 'a.txt', 'x');
    expect(hidden.statusCode).toBe(404);
    expect(errorCode(hidden)).toBe('ISSUE_NOT_FOUND');
  });

  it('keeps the type the content confirms, whatever the client says it is', async () => {
    const key = await report('WEB', graceCookie);
    const id = await attach(key, graceCookie, 'scan.PDF', PDF, {
      headers: { 'content-type': 'application/octet-stream; charset=binary' },
    });

    expect((await filesOf(key)).find((file) => file.id === id)?.mediaType).toBe('application/pdf');
  });

  it.each([
    [
      'capture.png',
      '<!doctype html><script>alert(document.cookie)</script>',
      'ATTACHMENT_CONTENT_MISMATCH',
    ],
    ['facture.pdf', PNG, 'ATTACHMENT_CONTENT_MISMATCH'],
    ['export.csv', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]), 'ATTACHMENT_CONTENT_MISMATCH'],
    [
      'logo.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      'ATTACHMENT_TYPE_NOT_ALLOWED',
    ],
    ['page.html', '<p>hello</p>', 'ATTACHMENT_TYPE_NOT_ALLOWED'],
    ['setup.exe', Buffer.from([0x4d, 0x5a, 0x90, 0]), 'ATTACHMENT_TYPE_NOT_ALLOWED'],
    ['animation.gif', 'GIF89a', 'ATTACHMENT_TYPE_NOT_ALLOWED'],
  ])('refuses %s, keeping nothing of it', async (name, content, code) => {
    const key = await report('WEB', graceCookie);
    const response = await upload(key, graceCookie, name, content);

    expect(response.statusCode).toBe(415);
    expect(errorCode(response)).toBe(code);
    expect(await filesOf(key)).toStrictEqual([]);
    // Removed once the response is sent.
    await vi.waitFor(() => expect(readdirSync(join(filesRoot, '.incoming'))).toStrictEqual([]));
  });

  it('cleans the name it is given, and refuses one with nothing left or badly encoded', async () => {
    const key = await report('WEB', graceCookie);
    await attach(key, graceCookie, 'C:\\Users\\ines\\re\u0301sume\u0301\u202Eexe.txt', 'Hello');

    expect((await filesOf(key)).map(({ fileName }) => fileName)).toStrictEqual(['résuméexe.txt']);
    const blank = await upload(key, graceCookie, '\u202E', 'Hello');
    expect(blank.statusCode).toBe(400);
    expect(errorCode(blank)).toBe('INVALID_FILE_NAME');
    for (const headers of [{ [FILE_NAME_HEADER]: '%E0%A4%A' }, { [FILE_NAME_HEADER]: '' }]) {
      const invalid = await upload(key, graceCookie, 'notes.txt', 'Hello', { headers });
      expect(invalid.statusCode).toBe(400);
      expect(errorCode(invalid)).toBe('VALIDATION_FAILED');
    }
  });

  it('takes a file only, with its length, within the size limit', async () => {
    const key = await report('WEB', graceCookie);
    const json = await call('POST', `/api/v1/issues/${key}/attachments`, graceCookie, {
      file: { path: '/etc/passwd', size: 10, head: [], text: true },
    });
    expect(json.statusCode).toBe(415);

    const unsized = await upload(key, graceCookie, 'notes.txt', Readable.from(['Hello']));
    expect(unsized.statusCode).toBe(411);
    expect(errorCode(unsized)).toBe('LENGTH_REQUIRED');

    // As a browser sends an empty file.
    const empty = await upload(key, graceCookie, 'notes.txt', '', {
      headers: { 'content-length': '0' },
    });
    expect(empty.statusCode).toBe(400);
    expect(errorCode(empty)).toBe('ATTACHMENT_EMPTY');

    const large = await upload(
      key,
      graceCookie,
      'big.txt',
      'x'.repeat(TEST_ATTACHMENT_MAX_SIZE + 1),
    );
    expect(large.statusCode).toBe(413);
    expect(errorCode(large)).toBe('ATTACHMENT_TOO_LARGE');
    expect(
      (await upload(key, graceCookie, 'max.txt', 'x'.repeat(TEST_ATTACHMENT_MAX_SIZE))).statusCode,
    ).toBe(201);
  });

  it(`keeps at most ${ATTACHMENTS_MAX} files on a request, even sent at once`, async () => {
    const key = await report('WEB', graceCookie);
    const sent = await Promise.all(
      Array.from({ length: ATTACHMENTS_MAX + 2 }, (_, index) =>
        upload(key, graceCookie, `log-${index}.log`, `line ${index}`),
      ),
    );

    const statuses = sent.map(({ statusCode }) => statusCode);
    expect(statuses.filter((status) => status === 201)).toHaveLength(ATTACHMENTS_MAX);
    expect(statuses.filter((status) => status === 409)).toHaveLength(2);
    const tooMany = sent.find(({ statusCode }) => statusCode === 409);
    expect(tooMany && errorCode(tooMany)).toBe('TOO_MANY_ATTACHMENTS');
    expect(await filesOf(key)).toHaveLength(ATTACHMENTS_MAX);
  });

  it('gives forms the size limit', async () => {
    const response = await call('GET', '/api/v1/attachments/limits', ritaCookie);

    expect(attachmentLimitsResponseSchema.parse(response.json())).toStrictEqual({
      maxFileSize: TEST_ATTACHMENT_MAX_SIZE,
    });
    expect((await call('GET', '/api/v1/attachments/limits', '')).statusCode).toBe(401);
  });
});

describe('attaching files to a comment', () => {
  it('shows them with the comment, never on their own in the history', async () => {
    const key = await report('WEB', ritaCookie);
    const commentId = await comment(key, alanCookie);
    const id = await attach(key, alanCookie, 'trace.log', 'ERROR export failed', { commentId });

    const rows = await history(key, alanCookie);
    expect(rows.map(({ type }) => type)).toStrictEqual(['issue.commented', 'issue.created']);
    expect(rows[0]).toMatchObject({
      payload: {
        comment: {
          id: commentId,
          attachments: [
            { id, fileName: 'trace.log', mediaType: 'text/plain', actions: ['delete'] },
          ],
        },
      },
    });
    expect(await filesOf(key)).toStrictEqual([]);
    expect((await download(key, id, ritaCookie)).body).toBe('ERROR export failed');
  });

  it('lets only the comment’s author attach files to it', async () => {
    const key = await report('WEB', ritaCookie);
    const commentId = await comment(key, alanCookie);

    const refused = await upload(key, graceCookie, 'notes.txt', 'Mine', { commentId });
    expect(refused.statusCode).toBe(403);
    const moderator = await upload(key, adminCookie, 'notes.txt', 'Mine', { commentId });
    expect(moderator.statusCode).toBe(403);
    const elsewhere = await upload(await report('WEB', alanCookie), alanCookie, 'a.txt', 'x', {
      commentId,
    });
    expect(elsewhere.statusCode).toBe(404);
    expect(errorCode(elsewhere)).toBe('COMMENT_NOT_FOUND');
  });

  it('lets the author or a moderator remove them, and removes them with the comment', async () => {
    const key = await report('WEB', ritaCookie);
    const commentId = await comment(key, alanCookie);
    const first = await attach(key, alanCookie, 'a.txt', 'first', { commentId });
    const second = await attach(key, alanCookie, 'b.txt', 'second', { commentId });

    expect((await remove(key, first, graceCookie)).statusCode).toBe(403);
    expect((await remove(key, first, adminCookie)).statusCode).toBe(204);
    expect(
      (await call('DELETE', `/api/v1/issues/${key}/comments/${commentId}`, alanCookie)).statusCode,
    ).toBe(204);
    expect((await download(key, second)).statusCode).toBe(404);
  });
});

describe('downloading a file', () => {
  it('sends it as an attachment, as the type the server found, run by nothing', async () => {
    const key = await report('WEB', ritaCookie);
    const id = await attach(key, ritaCookie, 'export commandes (octobre).csv', CSV);

    const response = await download(key, id, graceCookie);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(CSV);
    expect(response.headers).toMatchObject({
      'content-type': 'text/csv',
      'content-length': String(Buffer.byteLength(CSV)),
      'content-disposition': `attachment; filename="export commandes (octobre).csv"; filename*=UTF-8''export%20commandes%20%28octobre%29.csv`,
      'content-security-policy': "default-src 'none'; sandbox",
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    });
  });

  it('lets the browser show images and PDFs by themselves, and nothing else', async () => {
    const key = await report('WEB', ritaCookie);
    const image = await attach(key, ritaCookie, 'capture.png', PNG);
    const pdf = await attach(key, ritaCookie, 'facture.pdf', PDF);
    const csv = await attach(key, ritaCookie, 'export.csv', CSV);

    const thumbnail = await preview(key, image, ritaCookie);
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.rawPayload).toStrictEqual(PNG);
    expect(thumbnail.headers).toMatchObject({
      'content-type': 'image/png',
      'content-disposition': `inline; filename="capture.png"; filename*=UTF-8''capture.png`,
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, max-age=86400',
    });
    const document = await preview(key, pdf, ritaCookie);
    expect(document.statusCode).toBe(200);
    expect(document.rawPayload).toStrictEqual(PDF);
    expect(document.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="facture.pdf"; filename*=UTF-8''facture.pdf`,
      'content-security-policy': "default-src 'none'; sandbox",
      'x-content-type-options': 'nosniff',
    });
    const none = await preview(key, csv, ritaCookie);
    expect(none.statusCode).toBe(404);
    expect(errorCode(none)).toBe('PREVIEW_NOT_AVAILABLE');
  });

  it('answers as if it did not exist from another issue, or to whoever does not see it', async () => {
    const key = await report('WEB', graceCookie);
    const id = await attach(key, graceCookie, 'notes.txt', 'Private');

    const elsewhere = await download(await report('WEB', graceCookie), id);
    expect(elsewhere.statusCode).toBe(404);
    expect(errorCode(elsewhere)).toBe('ATTACHMENT_NOT_FOUND');
    const hidden = await download(key, id, ritaCookie);
    expect(hidden.statusCode).toBe(404);
    expect(errorCode(hidden)).toBe('ISSUE_NOT_FOUND');
    expect((await download(key, id, '')).statusCode).toBe(401);
  });
});

describe('removing a file', () => {
  it('lets its uploader or whoever edits the issue remove it, for good', async () => {
    const key = await report('WEB', ritaCookie);
    const ritas = await attach(key, ritaCookie, 'capture.png', PNG);
    const graces = await attach(key, graceCookie, 'reponse.pdf', PDF);

    const refused = await remove(key, graces, ritaCookie);
    expect(refused.statusCode).toBe(403);
    expect(errorCode(refused)).toBe('FORBIDDEN');
    expect((await remove(key, ritas, ritaCookie)).statusCode).toBe(204);
    expect((await remove(key, graces, alanCookie)).statusCode).toBe(204);

    expect(await filesOf(key)).toStrictEqual([]);
    expect((await download(key, ritas)).statusCode).toBe(404);
    expect((await history(key)).map(({ type }) => type)).toStrictEqual(['issue.created']);
    const recorded = await context.database.db
      .select({ type: schema.activities.type, payload: schema.activities.payload })
      .from(schema.activities)
      .where(eq(schema.activities.type, 'issue.attachmentRemoved'));
    expect(recorded).toContainEqual({
      type: 'issue.attachmentRemoved',
      payload: { attachmentId: ritas },
    });
    expect((await remove(key, ritas, alanCookie)).statusCode).toBe(404);
  });

  it('leaves the disk at the next sweep, with the files of deleted issues', async () => {
    const storageKeyOf = async (id: string) => {
      const [row] = await context.database.db
        .select({ storageKey: schema.attachments.storageKey })
        .from(schema.attachments)
        .where(eq(schema.attachments.id, id));
      return row?.storageKey ?? '';
    };
    const key = await report('WEB', graceCookie);
    const kept = await attach(key, graceCookie, 'kept.txt', 'kept');
    const removed = await storageKeyOf(await attach(key, graceCookie, 'removed.txt', 'removed'));
    const gone = await report('WEB', graceCookie);
    const ofGone = await storageKeyOf(await attach(gone, graceCookie, 'gone.txt', 'gone'));
    const [removedId] = (await filesOf(key)).flatMap(({ id, fileName }) =>
      fileName === 'removed.txt' ? [id] : [],
    );
    expect((await remove(key, removedId ?? '', graceCookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/v1/issues/${gone}`, adminCookie)).statusCode).toBe(204);
    // Still on disk, unreachable, until the sweep.
    expect((await files.open(removed)).destroy()).toBeTruthy();
    ageEveryFile();

    // The sweep runs as a recurring job, by whichever worker comes first, among the others due.
    const worker = {
      db: context.database.db,
      jobs: createJobs({ files }),
      log: app.log,
      services: testServices(),
    };
    await scheduleRecurringJobs(context.database.db, worker.jobs);
    while (await runNextJob(worker)) {
      // Until none is due.
    }
    await expect(files.open(removed)).rejects.toThrow();
    await expect(files.open(ofGone)).rejects.toThrow();
    expect((await download(key, kept)).body).toBe('kept');
  });
});

describe('an archived project', () => {
  it('shows its files, offering nothing to do, and takes no new one', async () => {
    const key = await report('OLD', ritaCookie);
    const id = await attach(key, ritaCookie, 'capture.png', PNG);
    expect((await call('POST', '/api/v1/projects/OLD/archive', adminCookie)).statusCode).toBe(204);

    expect((await filesOf(key, ritaCookie)).map(({ actions }) => actions)).toStrictEqual([[]]);
    expect((await download(key, id, ritaCookie)).statusCode).toBe(200);
    const added = await upload(key, ritaCookie, 'more.png', PNG);
    expect(added.statusCode).toBe(409);
    expect(errorCode(added)).toBe('PROJECT_ARCHIVED');
    expect(errorCode(await remove(key, id, adminCookie))).toBe('PROJECT_ARCHIVED');
  });
});
