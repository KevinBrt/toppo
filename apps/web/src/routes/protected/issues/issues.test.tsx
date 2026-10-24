import { DEFAULT_CATEGORIES, DEFAULT_PRIORITIES } from '@toppo/core';
import { type CurrentUser, NOTIFICATION_EVENTS } from '@toppo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { lastProject, rememberProject } from '../../../features/issues/utils/last-project.util.ts';
import {
  ADA,
  defaultField,
  fakeIssue,
  fakeProject,
  fakeServer,
  GRACE,
  memberOf,
  ROLE_BADGES,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
  rememberProject(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  rememberProject(null);
});

/** A customer: sees and reports their own issues only. */
const RITA: CurrentUser = {
  id: '01a1569b-9900-7000-8000-000000000009',
  name: 'Rita Client',
  email: 'rita@example.com',
  locale: 'en',
  emailedEvents: [...NOTIFICATION_EVENTS],
  permissions: [],
  managesProjects: false,
};

const URGENT = defaultField(DEFAULT_PRIORITIES, 'urgent');
const HIGH = defaultField(DEFAULT_PRIORITIES, 'high');
const BUG = defaultField(DEFAULT_CATEGORIES, 'bug');

/** Ada and Grace in WEB and in API, Rita in WEB; two issues of WEB, one of Rita's. */
function server(user: CurrentUser = ADA) {
  const fake = fakeServer({
    user,
    projects: [
      fakeProject('WEB', 'Website', {
        members: [
          { userId: ADA.id, roleId: null },
          { userId: GRACE.id, roleId: null },
          { userId: RITA.id, roleId: null },
        ],
      }),
      fakeProject('API', 'Zeta API'),
    ],
    issues: [
      fakeIssue('WEB', 1, 'Broken link', { description: '**Steps**\n\n- open /about' }),
      fakeIssue('WEB', 2, 'Export is empty', { priorityId: URGENT.id, assigneeId: GRACE.id }),
      fakeIssue('WEB', 3, 'Please send my invoice', { reporterId: RITA.id }),
      fakeIssue('API', 1, 'Rate limit too low'),
    ],
  });
  fake.state.users.push(memberOf(RITA, ROLE_BADGES.requester));
  fake.state.activities.set('WEB-1', [
    {
      id: '01a1569b-9900-7000-8000-000000000801',
      type: 'issue.created',
      actor: { id: ADA.id, name: 'Ada Lovelace' },
      createdAt: '2026-10-22T09:14:00.000Z',
      payload: {},
    },
  ]);
  return fake;
}

const breadcrumb = () => page.getByRole('navigation', { name: 'Breadcrumb' });
const rowOf = (key: string) => page.getByRole('row').filter({ hasText: key });
/** The status control of the page's header: the properties beside it have the same one. */
const statusMenu = (status: string) =>
  page
    .getByRole('main')
    .getByRole('button', { name: `Status, ${status}` })
    .first();

describe('the issues screen', () => {
  it('opens on the first project one reaches, its issues newest first', async () => {
    server();
    const { screen, router } = await renderApp({ path: '/issues' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Issues' })).toBeVisible();
    expect(router.state.location.search).toEqual({ project: 'WEB' });
    await expect.element(screen.getByRole('link', { name: 'Export is empty' })).toBeVisible();
    const urgent = rowOf('WEB-2');
    await expect.element(urgent.getByText('Urgent')).toBeVisible();
    await expect.element(urgent.getByText('Grace Hopper')).toBeVisible();
    const keys = await Promise.all(
      [0, 1, 2].map(
        (index) =>
          page
            .getByRole('row')
            .nth(index + 1)
            .getByRole('cell')
            .first()
            .element().textContent,
      ),
    );
    expect(keys).toStrictEqual(['WEB-3', 'WEB-2', 'WEB-1']);
    expect(lastProject()).toBe('WEB');
  });

  it('switches projects from the top bar, and remembers the one chosen', async () => {
    server();
    const { screen, router } = await renderApp({ path: '/issues?project=WEB' });

    await breadcrumb().getByRole('button', { name: 'Project: Website' }).click();
    await screen.getByRole('menuitem', { name: /Zeta API/ }).click();

    await expect.element(screen.getByRole('link', { name: 'Rate limit too low' })).toBeVisible();
    expect(router.state.location.search).toEqual({ project: 'API' });
    expect(lastProject()).toBe('API');
  });

  it('shows a requester their own issues only', async () => {
    server(RITA);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await expect
      .element(screen.getByRole('link', { name: 'Please send my invoice' }))
      .toBeVisible();
    await expect.element(screen.getByText('Broken link')).not.toBeInTheDocument();
    await expect
      .element(breadcrumb().getByRole('link', { name: 'Projects' }))
      .not.toBeInTheDocument();
  });

  it('gives an unassigned issue to someone from the list', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await rowOf('WEB-1').getByRole('button', { name: 'Assign WEB-1' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Assign WEB-1' });
    await dialog.getByRole('button', { name: /Grace Hopper/ }).click();

    await expect.element(rowOf('WEB-1').getByText('Grace Hopper')).toBeVisible();
    expect(fake.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/issues/WEB-1/assignee',
      body: { assigneeId: GRACE.id },
    });
  });

  it('says so when one reaches no project yet', async () => {
    fakeServer({ user: GRACE });
    const { screen } = await renderApp({ path: '/issues' });

    await expect.element(screen.getByText('No project yet')).toBeVisible();
  });
});

describe('a new issue', () => {
  it('is reported with its subject, description and fields, then opens', async () => {
    const fake = server();
    const { screen, router } = await renderApp({ path: '/issues/new?project=WEB' });

    await expect
      .element(screen.getByText('It will be added to the project Website.'))
      .toBeVisible();
    // Ready to type the subject at once.
    await expect.element(screen.getByLabelText('Subject')).toHaveFocus();
    await screen.getByLabelText('Subject').fill('Invoices fail to download');
    // Written as it reads: what follows the Bold button is bold, no Markdown mark shows.
    await screen.getByRole('textbox', { name: 'Description' }).click();
    await userEvent.keyboard('Error ');
    await screen.getByRole('button', { name: 'Bold' }).click();
    await expect
      .element(screen.getByRole('button', { name: 'Bold' }))
      .toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('500');
    await expect.element(screen.getByText('500', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('**')).not.toBeInTheDocument();
    await screen.getByLabelText('Priority').selectOptions('High');
    await screen.getByRole('radio', { name: 'Bug' }).click();
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Invoices fail to download' }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/issues/WEB-4');
    expect(fake.requests.find(({ method }) => method === 'POST')?.body).toEqual({
      title: 'Invoices fail to download',
      description: 'Error **500**',
      priorityId: HIGH.id,
      categoryId: BUG.id,
    });
    await expect.element(breadcrumb().getByText('WEB-4')).toBeVisible();
  });

  it('turns the usual shortcuts into what they mean, and keeps Markdown', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByLabelText('Subject').fill('Steps');
    await screen.getByRole('textbox', { name: 'Description' }).click();
    await userEvent.keyboard('- open the list{Enter}export it');
    await expect
      .element(screen.getByRole('button', { name: 'Bulleted list' }))
      .toHaveAttribute('aria-pressed', 'true');
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Steps' })).toBeVisible();
    expect(fake.requests.find(({ method }) => method === 'POST')?.body).toMatchObject({
      description: '- open the list\n- export it',
    });
  });

  it('links only to web pages and email', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByRole('textbox', { name: 'Description' }).click();
    await screen.getByRole('button', { name: 'Link' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Add a link' });
    await dialog.getByLabelText('Address').fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Add the link' }).click();
    await expect
      .element(dialog.getByText('An address starting with https://, http:// or mailto:.'))
      .toBeVisible();

    await dialog.getByLabelText('Address').fill('https://example.com/docs');
    await dialog.getByRole('button', { name: 'Add the link' }).click();
    await expect
      .element(screen.getByRole('link', { name: 'https://example.com/docs' }))
      .toBeVisible();
  });

  it('needs a subject', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect.element(screen.getByText('This field is required.')).toBeVisible();
    expect(fake.requests.filter(({ method }) => method === 'POST')).toHaveLength(0);
  });
});

describe('an issue’s page', () => {
  it('shows the request from Markdown, its fields, its history and the way back', async () => {
    const fake = server();
    fake.state.issues[0] = fakeIssue('WEB', 1, 'Broken link', {
      description: '**Steps**\n\n- open /about\n\n<script>alert(1)</script>',
    });
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Broken link' }))
      .toBeVisible();
    await expect.element(screen.getByText('Steps', { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole('listitem').filter({ hasText: 'open /about' }))
      .toBeVisible();
    // Raw HTML is dropped, never run nor shown.
    await expect.element(screen.getByText('alert(1)')).not.toBeInTheDocument();
    await expect
      .element(
        screen
          .getByRole('region', { name: 'Activity' })
          .getByText('Ada Lovelace created the issue', { exact: false }),
      )
      .toBeVisible();
    await expect.element(breadcrumb().getByRole('link', { name: 'Issues' })).toBeVisible();
    await expect.element(breadcrumb().getByText('WEB-1')).toBeVisible();
  });

  it('moves through the workflow, offering only the statuses allowed next', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await statusMenu('New').click();
    await expect.element(screen.getByRole('menuitemradio', { name: 'To do' })).toBeVisible();
    await expect
      .element(screen.getByRole('menuitemradio', { name: 'Waiting' }))
      .not.toBeInTheDocument();
    await screen.getByRole('menuitemradio', { name: 'In progress' }).click();

    await expect.element(statusMenu('In progress')).toBeVisible();
    // The latest change comes first.
    await expect
      .element(
        screen
          .getByRole('region', { name: 'Activity' })
          .getByRole('listitem')
          .first()
          .filter({ hasText: 'changed the status New to In progress' }),
      )
      .toBeVisible();
  });

  it('tells changes made together as one step, unfolded on demand', async () => {
    const fake = server();
    const together = {
      actor: { id: GRACE.id, name: 'Grace Hopper' },
      createdAt: '2026-10-22T10:30:00.000Z',
    };
    fake.state.activities.get('WEB-1')?.push(
      {
        ...together,
        id: '01a1569b-9900-7000-8000-000000000802',
        type: 'issue.priorityChanged',
        payload: {
          from: { id: defaultField(DEFAULT_PRIORITIES, 'normal').id, name: 'Normal', level: 2 },
          to: { id: HIGH.id, name: 'High', level: 3 },
        },
      },
      {
        ...together,
        id: '01a1569b-9900-7000-8000-000000000803',
        type: 'issue.categoryChanged',
        payload: {
          from: { id: defaultField(DEFAULT_CATEGORIES, 'request').id, name: 'Request' },
          to: { id: BUG.id, name: 'Bug' },
        },
      },
    );
    const { screen } = await renderApp({ path: '/issues/WEB-1' });
    const activity = screen.getByRole('region', { name: 'Activity' });

    await expect
      .element(
        activity.getByRole('listitem').first().filter({ hasText: 'Grace Hopper made 2 changes' }),
      )
      .toBeVisible();
    await expect.element(activity.getByText('Priority:')).not.toBeVisible();
    await activity.getByRole('button', { name: 'Details' }).click();

    await expect
      .element(activity.getByRole('button', { name: 'Hide' }))
      .toHaveAttribute('aria-expanded', 'true');
    const details = activity.getByRole('listitem').first().getByRole('listitem');
    await expect.element(details.nth(0)).toHaveTextContent('Priority: Normal to High');
    await expect.element(details.nth(1)).toHaveTextContent('Category: Request to Bug');
  });

  it('edits its title in place, and rolls it back with the reason when refused', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await screen.getByRole('button', { name: 'Edit the title' }).click();
    await screen.getByRole('textbox', { name: 'Subject' }).fill('Dead link on /about');
    await screen.getByRole('button', { name: 'Save' }).click();
    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Dead link on /about' }))
      .toBeVisible();

    const web = fake.state.projects.find(({ key }) => key === 'WEB');
    if (web) {
      web.archived = true;
    }
    await screen.getByRole('button', { name: 'Edit the title' }).click();
    await screen.getByRole('textbox', { name: 'Subject' }).fill('Never saved');
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect
      .element(screen.getByText('This project is archived: it is read-only.'))
      .toBeVisible();
    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Dead link on /about' }))
      .toBeVisible();
  });

  it('is given to someone, then to nobody', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });
    const properties = screen.getByRole('complementary', { name: 'Properties' });

    await properties.getByRole('button', { name: 'Assignee, Unassigned' }).click();
    await screen
      .getByRole('dialog')
      .getByRole('button', { name: /Grace Hopper/ })
      .click();
    await expect
      .element(properties.getByRole('button', { name: 'Assignee, Grace Hopper' }))
      .toBeVisible();

    await properties.getByRole('button', { name: 'Assignee, Grace Hopper' }).click();
    await screen.getByRole('dialog').getByRole('button', { name: 'Nobody' }).click();
    await expect
      .element(properties.getByRole('button', { name: 'Assignee, Unassigned' }))
      .toBeVisible();
  });

  it('changes its priority from the properties', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await screen.getByRole('button', { name: 'Priority, Normal' }).click();
    await screen.getByRole('menuitemradio', { name: 'High' }).click();

    await expect.element(screen.getByRole('button', { name: 'Priority, High' })).toBeVisible();
    expect(fake.requests).toContainEqual({
      method: 'PATCH',
      path: '/api/v1/issues/WEB-1',
      body: { priorityId: HIGH.id },
    });
  });

  it('leaves a requester the words of their issue, nothing more', async () => {
    server(RITA);
    const { screen } = await renderApp({ path: '/issues/WEB-3' });

    await expect.element(screen.getByRole('button', { name: 'Edit the title' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Priority, Normal' })).toBeDisabled();
    await expect.element(statusMenu('New')).toBeDisabled();
    await expect
      .element(screen.getByRole('button', { name: 'More actions' }))
      .not.toBeInTheDocument();
  });

  it('answers as if it did not exist to whoever may not see it', async () => {
    server(RITA);
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await expect
      .element(screen.getByText('This issue does not exist, or you cannot see it.'))
      .toBeVisible();
    await expect.element(screen.getByText('Broken link')).not.toBeInTheDocument();
  });

  it('is deleted after asking, back to the list', async () => {
    const fake = server();
    const { screen, router } = await renderApp({ path: '/issues/WEB-1' });

    await screen.getByRole('button', { name: 'More actions' }).click();
    await screen.getByRole('menuitem', { name: 'Delete the issue' }).click();
    await screen
      .getByRole('dialog', { name: 'Delete WEB-1?' })
      .getByRole('button', { name: 'Delete for good' })
      .click();

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Issues' })).toBeVisible();
    expect(router.state.location.search).toEqual({ project: 'WEB' });
    await expect.element(screen.getByText('Broken link')).not.toBeInTheDocument();
    expect(
      fake.state.issues.map(({ projectKey, number }) => `${projectKey}-${number}`),
    ).not.toContain('WEB-1');
  });
});
