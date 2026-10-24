import { DEFAULT_PRIORITIES } from '@toppo/core';
import { NOTIFICATION_EVENTS } from '@toppo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  defaultField,
  type FakeRole,
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A role that manages who has access to a project, and reads its issues. */
const LEAD: FakeRole = {
  id: '01a1569b-9900-7000-8000-000000000601',
  name: 'Lead',
  color: 'violet',
  grantsAll: false,
  notifyNewIssues: false,
  permissions: ['issue.read', 'issue.create', 'project.members.manage'],
};

/** A role that manages a project's settings too. */
const OWNER: FakeRole = {
  ...LEAD,
  id: '01a1569b-9900-7000-8000-000000000602',
  name: 'Owner',
  permissions: [...LEAD.permissions, 'project.settings.manage'],
};

const KATHERINE = memberOf(
  {
    id: '01a1569b-9900-7000-8000-000000000003',
    name: 'Katherine Johnson',
    email: 'katherine@example.com',
    locale: 'en',
    emailedEvents: [...NOTIFICATION_EVENTS],
    permissions: [],
    managesProjects: false,
  },
  ROLE_BADGES.team,
);

const PROJECTS = () => [
  fakeProject('WEB', 'Website', { description: 'The public site', color: 'orange' }),
  fakeProject('API', 'Public API'),
  fakeProject('OLD', 'Old intranet', { archived: true }),
];

/** Grace has the role `roleId` in WEB, and only her own role in API. */
const GRACE_IN_WEB = (roleId: string) => [
  fakeProject('WEB', 'Website', {
    members: [
      { userId: ADA.id, roleId: null },
      { userId: GRACE.id, roleId },
    ],
  }),
  fakeProject('API', 'Public API'),
];

/** The fake server, with Lead and Owner among the roles and Katherine among the members. */
function serverWith(user: typeof ADA, projects = PROJECTS()) {
  const server = fakeServer({ user, projects });
  server.state.roles.push(LEAD, OWNER);
  server.state.users.push(KATHERINE);
  return server;
}

const mainNavigation = () => page.getByRole('navigation', { name: 'Main navigation' });
const projectSections = () => page.getByRole('navigation', { name: 'Project sections' });
const breadcrumb = () => page.getByRole('navigation', { name: 'Breadcrumb' });
const roleOf = (name: string) =>
  page.getByRole('button', { name: new RegExp(`^Role of ${name} in the project, `) });

describe('the projects screen', () => {
  it('lists the projects one manages with their members, the archived ones apart', async () => {
    serverWith(ADA);
    const { screen } = await renderApp({ path: '/projects' });

    const website = screen.getByRole('row').filter({ hasText: 'Website' });
    await expect.element(website.getByRole('link', { name: 'Website' })).toBeVisible();
    await expect.element(website.getByText('2 members')).toBeInTheDocument();
    await expect.element(screen.getByRole('link', { name: 'Public API' })).toBeVisible();
    await expect.element(screen.getByText('Old intranet')).not.toBeInTheDocument();

    await screen.getByRole('button', { name: 'Archived 1' }).click();

    await expect.element(screen.getByRole('link', { name: 'Old intranet' })).toBeVisible();
    await expect.element(screen.getByText('Website')).not.toBeInTheDocument();
  });

  it('counts the open issues of each project, the urgent ones apart', async () => {
    const server = serverWith(ADA);
    const urgent = defaultField(DEFAULT_PRIORITIES, 'urgent');
    server.state.issues.push(
      fakeIssue('WEB', 1, 'Broken link', { priorityId: urgent.id }),
      fakeIssue('WEB', 2, 'Slow page'),
      fakeIssue('WEB', 3, 'Fixed', { closedAt: '2026-10-22T10:00:00.000Z' }),
    );
    const { screen } = await renderApp({ path: '/projects' });

    const website = screen.getByRole('row').filter({ hasText: 'Website' });
    await expect.element(website.getByText('2', { exact: true })).toBeVisible();
    await expect.element(website.getByText('incl. 1 urgent')).toBeVisible();
    await expect.element(website.getByText('None yet')).toBeVisible();
  });

  it('has the server search, keeping the search in the address', async () => {
    const server = serverWith(ADA);
    const { screen, router } = await renderApp({ path: '/projects' });

    await screen.getByRole('searchbox', { name: 'Key or name' }).fill('api');

    await expect.element(screen.getByText('Website')).not.toBeInTheDocument();
    await expect.element(screen.getByRole('link', { name: 'Public API' })).toBeVisible();
    expect(router.state.location.search).toEqual({ q: 'api' });
    expect(server.requests.map(({ path }) => path)).toContain(
      '/api/v1/projects?scope=managed&search=api',
    );
  });

  it('shows a member only the projects they manage, and its link only to them', async () => {
    serverWith(GRACE, GRACE_IN_WEB(LEAD.id));
    const { screen } = await renderApp({ path: '/projects' });

    await expect.element(screen.getByRole('link', { name: 'Website' })).toBeVisible();
    await expect.element(screen.getByText('Public API')).not.toBeInTheDocument();
    await expect.element(mainNavigation().getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'New project' }))
      .not.toBeInTheDocument();
  });

  it('leaves the link out for a member who manages no project', async () => {
    serverWith(GRACE, GRACE_IN_WEB(ROLE_BADGES.team.id));
    await renderApp({ path: '/issues' });

    await expect.element(mainNavigation().getByRole('link', { name: 'Issues' })).toBeVisible();
    await expect
      .element(mainNavigation().getByRole('link', { name: 'Projects' }))
      .not.toBeInTheDocument();
  });

  it('creates a project, its key suggested by its name, then opens it', async () => {
    const server = serverWith(ADA, []);
    const { screen, router } = await renderApp({ path: '/projects' });

    await screen.getByRole('button', { name: 'New project' }).click();
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabelText('Name').fill('Portail clients');
    await expect.element(dialog.getByLabelText('Key')).toHaveValue('PC');
    await dialog.getByRole('button', { name: 'Create the project' }).click();

    await expect.element(screen.getByRole('heading', { level: 1, name: 'General' })).toBeVisible();
    await expect.element(breadcrumb().getByText('Portail clients')).toBeVisible();
    expect(router.state.location.pathname).toBe('/projects/PC');
    expect(server.requests.find(({ method }) => method === 'POST')?.body).toEqual({
      key: 'PC',
      name: 'Portail clients',
      description: '',
    });
  });

  it('keeps the key the person typed, and says when another project has it', async () => {
    serverWith(ADA);
    const { screen } = await renderApp({ path: '/projects' });

    await screen.getByRole('button', { name: 'New project' }).click();
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabelText('Key').fill('web');
    await dialog.getByLabelText('Name').fill('Another website');
    await expect.element(dialog.getByLabelText('Key')).toHaveValue('WEB');
    await dialog.getByRole('button', { name: 'Create the project' }).click();

    await expect.element(dialog.getByText('Another project already has this key.')).toBeVisible();
  });
});

describe('a project’s pages', () => {
  it('open on its general settings, the project named above and beside them', async () => {
    serverWith(ADA);
    const { screen } = await renderApp({ path: '/projects/WEB' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'General' })).toBeVisible();
    await expect.element(breadcrumb().getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect.element(breadcrumb().getByText('Website')).toBeVisible();
    await expect.element(projectSections().getByText('Website')).toBeVisible();
    await expect
      .element(projectSections().getByRole('link', { name: 'All projects' }))
      .toBeVisible();
    await expect.element(projectSections().getByRole('link', { name: 'Access' })).toBeVisible();
  });

  it('answer as if the project did not exist when one cannot reach it', async () => {
    serverWith(GRACE, [
      fakeProject('HR', 'People', { members: [{ userId: ADA.id, roleId: null }] }),
    ]);
    const { screen } = await renderApp({ path: '/projects/HR' });

    await expect
      .element(screen.getByText('This project does not exist, or you do not have access to it.'))
      .toBeVisible();
    await expect.element(screen.getByText('People')).not.toBeInTheDocument();
  });

  it('are closed to a member who manages nothing in the project', async () => {
    serverWith(GRACE, GRACE_IN_WEB(ROLE_BADGES.team.id));
    const { screen } = await renderApp({ path: '/projects/WEB' });

    await expect.element(screen.getByText('You do not have access to this page')).toBeVisible();
  });

  it('send who only manages access to it', async () => {
    serverWith(GRACE, GRACE_IN_WEB(LEAD.id));
    const { screen, router } = await renderApp({ path: '/projects/WEB' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Project access' }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/projects/WEB/access');
    await expect
      .element(projectSections().getByRole('link', { name: 'General' }))
      .not.toBeInTheDocument();
  });
});

describe('a project’s general settings', () => {
  it('rename it, recolor it and change its key, the address following the key', async () => {
    const server = serverWith(ADA);
    const { screen, router } = await renderApp({ path: '/projects/WEB' });

    await screen.getByLabelText('Project name').fill('Public website');
    await screen.getByLabelText('Key').fill('site');
    await expect.element(screen.getByText('Example: SITE-42 · /issues/SITE-42')).toBeVisible();
    await screen.getByRole('radio', { name: 'Pink' }).click();
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByLabelText('Key')).toHaveValue('SITE');
    expect(router.state.location.pathname).toBe('/projects/SITE');
    expect(server.requests).toContainEqual({
      method: 'PATCH',
      path: '/api/v1/projects/WEB',
      body: { key: 'SITE', name: 'Public website', description: 'The public site', color: 'pink' },
    });
  });

  it('keep the key once the project has had issues', async () => {
    serverWith(ADA, [fakeProject('WEB', 'Website', { keyEditable: false })]);
    const { screen } = await renderApp({ path: '/projects/WEB' });

    await expect.element(screen.getByLabelText('Key')).toHaveAttribute('readonly');
    await expect.element(screen.getByText('Fixed: the project has had issues.')).toBeVisible();
  });

  it('archive it after asking, then bring it back', async () => {
    const server = serverWith(ADA);
    const { screen } = await renderApp({ path: '/projects/WEB' });

    await screen.getByRole('button', { name: 'Archive', exact: true }).click();
    const dialog = screen.getByRole('dialog', { name: 'Archive Website?' });
    await dialog.getByRole('button', { name: 'Archive the project' }).click();

    // Read-only: nothing left to edit, only the way back.
    await expect.element(screen.getByRole('button', { name: 'Unarchive' })).toBeVisible();
    await expect.element(screen.getByLabelText('Project name')).not.toBeInTheDocument();
    expect(server.state.projects[0]?.archived).toBe(true);

    await screen.getByRole('button', { name: 'Unarchive' }).click();

    await expect.element(screen.getByLabelText('Project name')).toHaveValue('Website');
    expect(server.state.projects[0]?.archived).toBe(false);
  });

  it('delete it for good once its key is typed, back to the projects', async () => {
    const server = serverWith(ADA);
    const { screen, router } = await renderApp({ path: '/projects/WEB' });

    await screen.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = screen.getByRole('dialog', { name: 'Delete Website?' });
    const confirm = dialog.getByRole('button', { name: 'Delete for good' });
    await expect.element(confirm).toBeDisabled();
    await dialog.getByLabelText('Type WEB to confirm').fill('web');
    await confirm.click();

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/projects');
    await expect.element(screen.getByText('Website')).not.toBeInTheDocument();
    expect(server.state.projects.map(({ key }) => key)).toStrictEqual(['API', 'OLD']);
  });

  it('offer no deletion to someone who may not delete projects', async () => {
    serverWith(GRACE, GRACE_IN_WEB(OWNER.id));
    const { screen } = await renderApp({ path: '/projects/WEB' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'General' })).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Archive', exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Delete', exact: true }))
      .not.toBeInTheDocument();
  });
});

describe('a project’s access', () => {
  it('lists who reaches it automatically, its members and its invitations', async () => {
    const server = serverWith(ADA, GRACE_IN_WEB(LEAD.id));
    server.state.invitations.push({
      id: '01a1569b-9900-7000-8000-000000000701',
      email: 'nina@example.com',
      role: ROLE_BADGES.requester,
      invitedBy: 'Ada Lovelace',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    server.state.invitationProjects.set('01a1569b-9900-7000-8000-000000000701', {
      allProjects: false,
      projectKeys: ['WEB'],
    });
    const { screen } = await renderApp({ path: '/projects/WEB/access' });

    await expect
      .element(screen.getByRole('heading', { level: 2, name: 'Members 3' }))
      .toBeVisible();
    const ada = screen.getByRole('listitem').filter({ hasText: 'Ada Lovelace' });
    await expect.element(ada.getByText('Automatic access')).toBeVisible();
    await expect.element(ada.getByText('Administrator')).toBeVisible();
    await expect.element(roleOf('Grace Hopper')).toHaveAccessibleName(/, Lead$/);
    const nina = screen.getByRole('listitem').filter({ hasText: 'nina@example.com' });
    await expect.element(nina.getByText('Invitation sent')).toBeVisible();

    await screen.getByRole('button', { name: 'Remove nina@example.com from the project' }).click();

    await expect.element(screen.getByText('nina@example.com')).not.toBeInTheDocument();
    expect(server.state.invitationProjects.get('01a1569b-9900-7000-8000-000000000701')).toEqual({
      allProjects: false,
      projectKeys: [],
    });
  });

  it('gets someone new, with the role chosen for the project', async () => {
    const server = serverWith(ADA);
    const { screen } = await renderApp({ path: '/projects/WEB/access' });

    await screen.getByRole('button', { name: 'Add members' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Add members' });
    await dialog.getByRole('checkbox', { name: /Katherine Johnson/ }).click();
    await expect.element(dialog.getByText('1 person selected')).toBeVisible();
    await dialog.getByLabelText('Role in the project').selectOptions('Lead');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();

    await expect.element(roleOf('Katherine Johnson')).toHaveAccessibleName(/, Lead$/);
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/projects/WEB/members',
      body: { userIds: [KATHERINE.id], roleId: LEAD.id },
    });
  });

  it('changes a role in place, and removes a member', async () => {
    const server = serverWith(ADA);
    const { screen } = await renderApp({ path: '/projects/WEB/access' });

    await roleOf('Grace Hopper').click();
    await screen.getByRole('menuitemradio', { name: 'Lead' }).click();

    await expect.element(roleOf('Grace Hopper')).toHaveAccessibleName(/, Lead$/);
    expect(server.state.projects[0]?.members).toContainEqual({ userId: GRACE.id, roleId: LEAD.id });

    await roleOf('Grace Hopper').click();
    await screen.getByRole('menuitemradio', { name: 'Own role (Team)' }).click();
    await expect.element(roleOf('Grace Hopper')).toHaveAccessibleName(/, Own role \(Team\)$/);

    await screen.getByRole('button', { name: 'Remove Grace Hopper from the project' }).click();

    await expect.element(screen.getByText('Grace Hopper')).not.toBeInTheDocument();
    expect(server.state.projects[0]?.members).toEqual([{ userId: ADA.id, roleId: null }]);
  });

  it('cannot give more rights than its manager holds in the project', async () => {
    const server = serverWith(GRACE, GRACE_IN_WEB(LEAD.id));
    server.state.projects[0]?.members.push({ userId: KATHERINE.id, roleId: null });
    const { screen } = await renderApp({ path: '/projects/WEB/access' });

    // Lead is hers to give; the system role is nobody's.
    await roleOf('Katherine Johnson').click();
    await expect
      .element(screen.getByRole('menuitemradio', { name: 'Administrator' }))
      .not.toBeInTheDocument();
    await screen.getByRole('menuitemradio', { name: 'Lead' }).click();

    // Katherine's Team role edits issues, which Lead may not: the server refuses, her role comes back.
    await expect
      .element(screen.getByText('You cannot give more rights than you hold in this project.'))
      .toBeVisible();
    await expect.element(roleOf('Katherine Johnson')).toHaveAccessibleName(/, Own role \(Team\)$/);
  });

  it('shows an archived project’s access without changing it', async () => {
    serverWith(ADA, [fakeProject('WEB', 'Website', { archived: true })]);
    const { screen } = await renderApp({ path: '/projects/WEB/access' });

    await expect
      .element(screen.getByText('This project is archived: it is read-only.'))
      .toBeVisible();
    await expect.element(screen.getByText('Grace Hopper')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'Add members' }))
      .not.toBeInTheDocument();
  });
});
