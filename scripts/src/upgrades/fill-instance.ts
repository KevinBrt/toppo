/**
 * Fills a fresh Toppo through its API as a small team would: every kind of row the version can
 * write, written by its own code, so that a snapshot of it holds what real databases hold.
 */
import { type apiOf, invitationToken, PASSWORD, ROLE_IDS } from '../harness/built-server.ts';

type Api = ReturnType<typeof apiOf>;

/** The accounts the snapshot holds, all signing in with `PASSWORD`. */
const ACCOUNTS = {
  admin: 'ada@example.com',
  team: 'grace@example.com',
  requester: 'rita@example.com',
} as const;

interface Named {
  id: string;
  name: string;
}

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

/**
 * Someone invited with `roleId` to `projectKeys`, their account opened: their id, and their
 * session (signing in is rate limited).
 */
async function invite(
  api: Api,
  admin: string,
  person: { name: string; email: string; roleId: string; projectKeys: string[] },
): Promise<{ id: string; cookie: string }> {
  const invited = await api.call('POST', '/api/v1/invitations', {
    cookie: admin,
    body: { emails: [person.email], roleId: person.roleId, projectKeys: person.projectKeys },
  });
  await api.call('POST', '/api/v1/invitations/accept', {
    body: {
      token: invitationToken(await invited.json()),
      name: person.name,
      password: PASSWORD,
    },
  });
  const cookie = await api.signIn(person.email);
  const me = await json<{ user: { id: string } }>(api.call('GET', '/api/v1/me', { cookie }));
  return { id: me.user.id, cookie };
}

export async function fillInstance(api: Api, setupCode: string): Promise<void> {
  await api.call('POST', '/api/v1/setup', {
    body: {
      setupCode,
      admin: { name: 'Ada Lovelace', email: ACCOUNTS.admin, password: PASSWORD },
    },
  });
  const admin = await api.signIn(ACCOUNTS.admin);
  const as = (cookie: string) => ({
    get: <T>(path: string) => json<T>(api.call('GET', path, { cookie })),
    post: (path: string, body?: object) =>
      api.call('POST', path, { cookie, ...(body ? { body } : {}) }),
    put: (path: string, body: object) => api.call('PUT', path, { cookie, body }),
    patch: (path: string, body: object) => api.call('PATCH', path, { cookie, body }),
    remove: (path: string) => api.call('DELETE', path, { cookie }),
    // Sent as the browser does; the server reads the type from the file itself.
    attach: (path: string, file: { name: string; text: string }) =>
      api.call('POST', path, {
        cookie,
        raw: {
          data: new TextEncoder().encode(file.text),
          headers: { 'content-type': 'application/octet-stream', 'x-file-name': file.name },
        },
      }),
  });
  const ada = as(admin);

  // Projects, the lists of the instance and its properties, one of each type.
  for (const [key, name] of [
    ['WEB', 'Website'],
    ['API', 'Public API'],
    ['OLD', 'Old intranet'],
  ] as const) {
    await ada.post('/api/v1/projects', { key, name, description: `The ${name.toLowerCase()}.` });
  }
  await ada.put('/api/v1/labels', {
    labels: [
      { name: 'Mobile', color: 'blue' },
      { name: 'Billing', color: 'green' },
      { name: 'Security', color: 'pink' },
    ],
    removed: [],
  });
  const labels = (await ada.get<{ labels: Named[] }>('/api/v1/labels')).labels;
  const label = (name: string) => labels.find((candidate) => candidate.name === name)?.id ?? '';
  const property = async (body: object) =>
    (await json<{ id: string }>(ada.post('/api/v1/properties', body))).id;
  const asked = { shownInList: true, askedAtCreation: true, required: false };
  const browser = await property({
    ...asked,
    name: 'Browser',
    type: 'list',
    options: [
      { name: 'Firefox', color: 'orange' },
      { name: 'Chrome', color: 'blue' },
    ],
  });
  const platforms = await property({
    ...asked,
    name: 'Platforms',
    type: 'multiSelect',
    options: [
      { name: 'Web', color: 'cyan' },
      { name: 'iOS', color: 'gray' },
      { name: 'Android', color: 'green' },
    ],
  });
  const version = await property({ ...asked, name: 'Version', type: 'text' });
  const estimate = await property({ ...asked, name: 'Estimate', type: 'number' });
  const due = await property({ ...asked, name: 'Due', type: 'date' });
  const reviewer = await property({ ...asked, name: 'Reviewer', type: 'user' });
  const regression = await property({ ...asked, name: 'Regression', type: 'checkbox' });
  const options = (
    await ada.get<{ properties: (Named & { options: Named[] })[] }>('/api/v1/properties')
  ).properties.flatMap((candidate) => candidate.options);
  const option = (name: string) => options.find((candidate) => candidate.name === name)?.id ?? '';
  // API hides the estimate; WEB has a property of its own.
  await ada.put(`/api/v1/projects/API/properties/${estimate}/adaptation`, {
    hidden: true,
    options: null,
  });
  await ada.post('/api/v1/projects/WEB/properties', {
    ...asked,
    name: 'Customer',
    type: 'text',
  });
  await ada.post('/api/v1/roles', { name: 'Reviewer', color: 'violet' });

  // The team: Grace on the team of WEB and API, Rita reporting in WEB, Otto gone since.
  const grace = await invite(api, admin, {
    name: 'Grace Hopper',
    email: ACCOUNTS.team,
    roleId: ROLE_IDS.team,
    projectKeys: ['WEB', 'API'],
  });
  const rita = await invite(api, admin, {
    name: 'Rita Client',
    email: ACCOUNTS.requester,
    roleId: ROLE_IDS.requester,
    projectKeys: ['WEB'],
  });
  const otto = await invite(api, admin, {
    name: 'Otto Former',
    email: 'otto@example.com',
    roleId: ROLE_IDS.team,
    projectKeys: ['WEB'],
  });
  await ada.post('/api/v1/invitations', {
    emails: ['pending@example.com'],
    roleId: ROLE_IDS.team,
    projectKeys: ['API'],
  });
  const graceAs = as(grace.cookie);
  const ritaAs = as(rita.cookie);
  await ritaAs.put('/api/v1/me/locale', { locale: 'fr' });
  await graceAs.put('/api/v1/me/email-notifications', {
    emailed: ['created', 'assigned', 'assigneeChanged', 'commented', 'mentioned'],
  });

  // Issues, changed in every way their page allows.
  const fields = await ada.get<{ statuses: Named[]; categories: Named[]; priorities: Named[] }>(
    '/api/v1/projects/WEB/issue-fields',
  );
  const idIn = (list: readonly Named[], name: string) =>
    list.find((candidate) => candidate.name === name)?.id ?? '';
  const status = (name: string) => idIn(fields.statuses, name);
  const report = async (who: ReturnType<typeof as>, project: string, body: object) =>
    (await json<{ key: string }>(who.post(`/api/v1/projects/${project}/issues`, body))).key;
  const crash = await report(ada, 'WEB', {
    title: 'Crash when exporting invoices',
    description: '**Steps**\n\n1. Open the invoices\n2. Click *Export*\n\nIt crashes.',
    assigneeId: grace.id,
    properties: {
      [browser]: option('Firefox'),
      [platforms]: [option('Web'), option('iOS')],
      [version]: '1.2.0',
      [estimate]: 3.5,
      [due]: '2026-11-02',
      [reviewer]: grace.id,
      [regression]: true,
    },
  });
  const request = await report(ritaAs, 'WEB', {
    title: 'Please send my invoice again',
    description: 'I cannot find it in my mailbox.',
  });
  const twin = await report(graceAs, 'WEB', { title: 'Export of invoices crashes' });
  const gone = await report(ada, 'WEB', { title: 'Typo on the home page' });
  const endpoint = await report(ada, 'API', {
    title: 'Rate limit too low',
    assigneeId: grace.id,
  });
  await report(ada, 'OLD', { title: 'Migrate the old pages' });

  await ada.put(`/api/v1/issues/${crash}/status`, { statusId: status('In progress') });
  await ada.put(`/api/v1/issues/${crash}/labels`, { labelIds: [label('Billing')] });
  await ada.put(`/api/v1/issues/${crash}/properties/${version}`, { value: '1.2.1' });
  await ada.patch(`/api/v1/issues/${crash}`, {
    title: 'Crash when exporting the invoices',
    description: '**Steps**\n\n1. Open the invoices\n2. Click *Export*\n\nIt crashes in Firefox.',
  });
  await ada.post('/api/v1/projects/WEB/issues/bulk/fields', {
    issueKeys: [request],
    categoryId: idIn(fields.categories, 'Bug'),
    priorityId: idIn(fields.priorities, 'High'),
  });
  await graceAs.put(`/api/v1/issues/${request}/assignee`, { assigneeId: otto.id });
  await graceAs.put(`/api/v1/issues/${endpoint}/status`, { statusId: status('Resolved') });
  const said = await json<{ id: string }>(
    graceAs.post(`/api/v1/issues/${crash}/comments`, {
      body: '@Ada Lovelace it comes from the PDF library.',
      mentions: [await adminId(ada)],
    }),
  );
  await graceAs.patch(`/api/v1/issues/${crash}/comments/${said.id}`, {
    body: '@Ada Lovelace it comes from the PDF library, version 4.',
    mentions: [await adminId(ada)],
  });
  const dropped = await json<{ id: string }>(
    ritaAs.post(`/api/v1/issues/${request}/comments`, { body: 'Any news?' }),
  );
  await ritaAs.post(`/api/v1/issues/${request}/comments`, { body: 'Still waiting.' });
  await ritaAs.remove(`/api/v1/issues/${request}/comments/${dropped.id}`);
  await graceAs.attach(`/api/v1/issues/${crash}/attachments`, {
    name: 'export.log',
    text: 'Error: PDF export failed at line 42',
  });
  const mistaken = await json<{ id: string }>(
    graceAs.attach(`/api/v1/issues/${crash}/attachments`, {
      name: 'wrong.txt',
      text: 'Not the right file',
    }),
  );
  await graceAs.remove(`/api/v1/issues/${crash}/attachments/${mistaken.id}`);
  await graceAs.put(`/api/v1/issues/${request}/following`, { following: true });
  await ada.put(`/api/v1/issues/${gone}/following`, { following: false });
  await graceAs.put(`/api/v1/issues/${twin}/duplicate-of`, {
    originalKey: crash,
    statusId: status('Resolved'),
  });
  await ada.post('/api/v1/projects/WEB/issues/bulk/labels', {
    issueKeys: [crash, request],
    add: [label('Mobile')],
    remove: [],
  });
  await ada.remove(`/api/v1/issues/${gone}`);

  // What happened since: read by some, Otto's account closed, the old project archived.
  await graceAs.post('/api/v1/notifications/read', { all: true });
  await ada.post(`/api/v1/users/${otto.id}/deactivate`);
  await ada.post('/api/v1/projects/OLD/archive');
  console.log(`Filled: ${[crash, request, twin, gone, endpoint].join(', ')} and more.`);
}

async function adminId(ada: { get: <T>(path: string) => Promise<T> }): Promise<string> {
  return (await ada.get<{ user: { id: string } }>('/api/v1/me')).user.id;
}
