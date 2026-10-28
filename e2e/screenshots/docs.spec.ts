import { join } from 'node:path';
import {
  type APIRequestContext,
  expect,
  type Page,
  request as requests,
  test,
} from '@playwright/test';
import { SCREENSHOTS_FOLDER, SCREENSHOTS_SETUP_CODE } from './playwright.config.ts';

/**
 * The screenshots of the README and the documentation: a team's instance, filled through the
 * API as people would fill it, then the screens that tell what Toppo is.
 */

const PASSWORD = 'correct horse battery staple';
/** DEFAULT_ROLE_IDS.team (@toppo-tracker/core). */
const TEAM_ROLE = '01a1569b-9801-747e-91c9-d058653f2a8e';

interface Named {
  id: string;
  name: string;
}

/** An issue of the demonstration, its fields by name. */
interface DemoIssue {
  title: string;
  description?: string;
  priority: string;
  category: string;
  status: string;
  assignee?: string;
  labels?: string[];
  browser?: string;
}

type Api = ReturnType<typeof apiOf>;

/** Calls the API as `context`'s person; any refusal fails the run. */
function apiOf(context: APIRequestContext) {
  const send = async (method: string, path: string, data?: object): Promise<unknown> => {
    const response = await context.fetch(path, { method, ...(data ? { data } : {}) });
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
    return response.status() === 204 ? null : await response.json();
  };
  return {
    get: async <T>(path: string) => (await send('GET', path)) as T,
    post: async <T>(path: string, data?: object) => (await send('POST', path, data)) as T,
    put: (path: string, data: object) => send('PUT', path, data),
  };
}

/** A request context of its own, as a browser of the instance at `baseURL`. */
const contextFor = (baseURL: string) =>
  requests.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });

async function signIn(context: APIRequestContext, email: string): Promise<void> {
  const response = await context.post('/api/auth/sign-in/email', {
    data: { email, password: PASSWORD },
  });
  expect(response.ok()).toBe(true);
}

/** Someone of the team, invited to both projects and signed in: their id, and their API. */
async function teammate(baseURL: string, admin: Api, name: string, email: string) {
  const { invitations } = await admin.post<{ invitations: { link: string }[] }>(
    '/api/v1/invitations',
    { emails: [email], roleId: TEAM_ROLE, projectKeys: ['WEB', 'APP'] },
  );
  const token = new URL(invitations[0]?.link ?? '').hash.slice(1);
  const context = await contextFor(baseURL);
  const api = apiOf(context);
  await api.post('/api/v1/invitations/accept', { token, name, password: PASSWORD });
  await signIn(context, email);
  const { user } = await api.get<{ user: { id: string } }>('/api/v1/me');
  return { id: user.id, api };
}

/** One CSS pixel per pixel, whatever the screen's density: images of a reasonable size. */
async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOTS_FOLDER, `${name}.png`),
    animations: 'disabled',
    scale: 'css',
  });
}

test('the screens of the documentation', async ({ page, baseURL: base }) => {
  test.setTimeout(120_000);
  const baseURL = base ?? '';
  const adaContext = await contextFor(baseURL);
  const ada = apiOf(adaContext);
  await ada.post('/api/v1/setup', {
    setupCode: SCREENSHOTS_SETUP_CODE,
    admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
  });
  await signIn(adaContext, 'ada@example.com');

  // The instance: two projects, its labels, a property, and the team.
  await ada.post('/api/v1/projects', {
    key: 'WEB',
    name: 'Customer portal',
    description: 'The portal our customers sign in to.',
  });
  await ada.post('/api/v1/projects', { key: 'APP', name: 'Mobile app' });
  await ada.put('/api/v1/labels', {
    labels: [
      { name: 'Billing', color: 'green' },
      { name: 'Mobile', color: 'blue' },
      { name: 'Performance', color: 'orange' },
      { name: 'Security', color: 'pink' },
      { name: 'UX', color: 'violet' },
    ],
    removed: [],
  });
  await ada.post('/api/v1/properties', {
    name: 'Browser',
    type: 'list',
    shownInList: true,
    askedAtCreation: true,
    required: false,
    options: [
      { name: 'Firefox', color: 'orange' },
      { name: 'Chrome', color: 'blue' },
      { name: 'Safari', color: 'cyan' },
    ],
  });
  const grace = await teammate(baseURL, ada, 'Grace Hopper', 'grace@example.com');
  const alan = await teammate(baseURL, ada, 'Alan Turing', 'alan@example.com');
  const margaret = await teammate(baseURL, ada, 'Margaret Hamilton', 'margaret@example.com');

  // Its issues, at every stage of the workflow.
  const fields = await ada.get<{
    statuses: Named[];
    categories: Named[];
    priorities: Named[];
    labels: Named[];
    properties: (Named & { options: Named[] })[];
  }>('/api/v1/projects/WEB/issue-fields');
  const idOf = (list: readonly Named[], name: string) =>
    list.find((item) => item.name === name)?.id ?? '';
  const browserField = fields.properties.find(({ name }) => name === 'Browser');
  const demo: DemoIssue[] = [
    {
      title: 'Invoices fail to download as PDF',
      description:
        'Since the last release, downloading an invoice as PDF fails for some customers.\n\n**Steps**\n\n1. Open **Billing › Invoices**\n2. Pick an invoice of more than 50 lines\n3. Click *Download PDF*\n\nThe download stops at 0 bytes.',
      priority: 'Urgent',
      category: 'Bug',
      status: 'In progress',
      assignee: grace.id,
      labels: ['Billing'],
      browser: 'Firefox',
    },
    {
      title: 'Export to CSV ignores the date filter',
      priority: 'High',
      category: 'Bug',
      status: 'To do',
      assignee: alan.id,
    },
    {
      title: 'Add two-factor authentication',
      priority: 'Normal',
      category: 'Request',
      status: 'In progress',
      assignee: margaret.id,
      labels: ['Security'],
    },
    {
      title: 'Search is slow on large projects',
      priority: 'High',
      category: 'Bug',
      status: 'To do',
      assignee: margaret.id,
      labels: ['Performance'],
    },
    {
      title: 'Typo on the pricing page',
      priority: 'Low',
      category: 'Bug',
      status: 'New',
      labels: ['UX'],
    },
    {
      title: 'Password reset email arrives late',
      priority: 'Normal',
      category: 'Bug',
      status: 'Waiting',
      assignee: grace.id,
    },
    {
      title: 'Dashboard charts overlap on small screens',
      priority: 'Normal',
      category: 'Bug',
      status: 'To do',
      assignee: alan.id,
      labels: ['Mobile', 'UX'],
      browser: 'Safari',
    },
    {
      title: 'Attach several files at once',
      priority: 'Normal',
      category: 'Request',
      status: 'New',
    },
    {
      title: 'Session expires while writing a comment',
      priority: 'High',
      category: 'Bug',
      status: 'In progress',
      assignee: alan.id,
      browser: 'Chrome',
    },
    {
      title: 'Translate the onboarding emails into German',
      priority: 'Low',
      category: 'Request',
      status: 'To do',
      assignee: margaret.id,
    },
    {
      title: 'Billing address is not saved for companies',
      priority: 'High',
      category: 'Bug',
      status: 'New',
      labels: ['Billing'],
    },
    {
      title: 'Can I change the email address of my account?',
      priority: 'Normal',
      category: 'Question',
      status: 'Waiting',
      assignee: grace.id,
    },
  ];
  const keys: string[] = [];
  for (const issue of demo) {
    const { key } = await ada.post<{ key: string }>('/api/v1/projects/WEB/issues', {
      title: issue.title,
      description: issue.description ?? '',
      priorityId: idOf(fields.priorities, issue.priority),
      categoryId: idOf(fields.categories, issue.category),
      ...(issue.assignee ? { assigneeId: issue.assignee } : {}),
      ...(issue.browser && browserField
        ? { properties: { [browserField.id]: idOf(browserField.options, issue.browser) } }
        : {}),
    });
    keys.push(key);
    // Waiting comes after In progress in the workflow.
    const path = issue.status === 'Waiting' ? ['In progress', 'Waiting'] : [issue.status];
    for (const status of path.filter((name) => name !== 'New')) {
      await ada.put(`/api/v1/issues/${key}/status`, { statusId: idOf(fields.statuses, status) });
    }
    if (issue.labels) {
      await ada.put(`/api/v1/issues/${key}/labels`, {
        labelIds: issue.labels.map((name) => idOf(fields.labels, name)),
      });
    }
  }

  // The first one, talked about, and found again under another name.
  const [invoices = ''] = keys;
  await grace.api.post(`/api/v1/issues/${invoices}/comments`, {
    body: 'I can reproduce it with every invoice over 50 lines. @Alan Turing, could it be the PDF library?',
    mentions: [alan.id],
  });
  await alan.api.post(`/api/v1/issues/${invoices}/comments`, {
    body: 'Yes: it runs out of memory on long tables. A fix is ready, I am testing it on staging.',
  });
  const { key: twin } = await ada.post<{ key: string }>('/api/v1/projects/WEB/issues', {
    title: 'Invoices are empty in Firefox',
  });
  await grace.api.put(`/api/v1/issues/${twin}/duplicate-of`, {
    originalKey: invoices,
    statusId: idOf(fields.statuses, 'Resolved'),
  });

  // The screens, as Ada sees them.
  await page.context().addCookies((await adaContext.storageState()).cookies);
  await page.goto('/issues?project=WEB');
  await expect(page.getByRole('link', { name: 'Invoices fail to download as PDF' })).toBeVisible();
  await shoot(page, 'issues');

  await page.goto(`/issues/${invoices}`);
  await expect(page.getByText('A fix is ready')).toBeVisible();
  await shoot(page, 'issue');

  await page.goto('/issues?project=WEB');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('combobox', { name: 'Search issues and pages' }).fill('invoce');
  await expect(page.getByRole('option', { name: /Invoices fail to download/ })).toBeVisible();
  await shoot(page, 'search');
});
