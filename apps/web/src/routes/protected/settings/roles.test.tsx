import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import type { PluginPermissionSection } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ADA, fakeServer, GRACE, renderApp } from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const control = (permission: string, role: string) =>
  page.getByRole('switch', { name: `${permission}, ${role}` });

const visibility = (role: string) => page.getByRole('combobox', { name: `See issues, ${role}` });

async function openRoles() {
  const server = fakeServer({ user: ADA });
  const rendered = await renderApp({ path: '/settings/roles' });
  await expect.element(control('Create issues', 'Team')).toBeVisible();
  return { server, ...rendered };
}

describe('the roles and permissions screen', () => {
  it('shows the roles side by side, the system role locked', async () => {
    const { screen } = await openRoles();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Roles and permissions' }))
      .toBeVisible();
    await expect
      .element(
        screen.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', {
          name: 'Roles and permissions',
        }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect.element(control('Create issues', 'Team')).toBeChecked();
    await expect.element(control('Delete issues', 'Team')).not.toBeChecked();
    await expect.element(visibility('Team')).toHaveValue('all');
    await expect.element(visibility('Requester')).toHaveValue('own');
    await expect.element(control('Delete issues', 'Administrator')).toBeChecked();
    await expect.element(control('Delete issues', 'Administrator')).toBeDisabled();
    await expect.element(visibility('Administrator')).toBeDisabled();
    await expect.element(control('Manage roles', 'Team')).toBeDisabled();
    await expect
      .element(screen.getByRole('button', { name: 'Actions for Administrator' }))
      .not.toBeInTheDocument();
  });

  it('counts unsaved changes cell by cell, and discards them', async () => {
    const { screen } = await openRoles();

    await control('Delete issues', 'Team').click();
    await visibility('Requester').selectOptions('all');
    await expect.element(screen.getByText('2 unsaved changes')).toBeVisible();
    await control('Delete issues', 'Team').click();
    await expect.element(screen.getByText('1 unsaved change')).toBeVisible();

    await screen.getByRole('button', { name: 'Discard' }).click();

    await expect.element(screen.getByText(/unsaved change/)).not.toBeInTheDocument();
    await expect.element(visibility('Requester')).toHaveValue('own');
  });

  it('saves every changed role at once, from what the screen showed', async () => {
    const { server, screen } = await openRoles();

    await control('Assign issues', 'Team').click();
    await visibility('Requester').selectOptions('none');
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByText('Permissions saved.')).toBeVisible();
    await expect.element(screen.getByText(/unsaved change/)).not.toBeInTheDocument();
    const save = server.requests.find(({ method }) => method === 'PUT');
    expect(save).toEqual({
      method: 'PUT',
      path: '/api/v1/roles/permissions',
      body: {
        changes: [
          {
            roleId: DEFAULT_ROLE_IDS.team,
            from: [
              'issue.read',
              'issue.read.own',
              'issue.create',
              'issue.update',
              'issue.assign',
              'comment.create',
            ],
            to: ['issue.read', 'issue.read.own', 'issue.create', 'issue.update', 'comment.create'],
          },
          {
            roleId: DEFAULT_ROLE_IDS.requester,
            from: ['issue.read.own', 'issue.create', 'comment.create'],
            to: ['issue.create', 'comment.create'],
          },
        ],
      },
    });
    await expect.element(control('Assign issues', 'Team')).not.toBeChecked();
  });

  it('shows another administrator’s changes rather than overwriting them', async () => {
    const { server, screen } = await openRoles();
    await control('Delete issues', 'Team').click();
    // Meanwhile, someone else lets the Team role moderate comments.
    const team = server.state.roles.find(({ id }) => id === DEFAULT_ROLE_IDS.team);
    team?.permissions.push('comment.moderate');

    await screen.getByRole('button', { name: 'Save' }).click();

    await expect
      .element(screen.getByText(/Another administrator changed these roles meanwhile/))
      .toBeVisible();
    await expect.element(control('Moderate comments', 'Team')).toBeChecked();
    await expect.element(control('Delete issues', 'Team')).not.toBeChecked();
    await expect.element(screen.getByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it('creates a role, shown as a new column without permissions', async () => {
    const { screen } = await openRoles();

    await screen.getByRole('button', { name: 'New role' }).click();
    const dialog = screen.getByRole('dialog', { name: 'New role' });
    await dialog.getByLabelText('Name').fill('Supervisor');
    await dialog.getByText('Violet').click();
    await expect.element(dialog.getByRole('radio', { name: 'Violet' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Create the role' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(control('Create issues', 'Supervisor')).not.toBeChecked();
    await expect.element(visibility('Supervisor')).toHaveValue('none');
  });

  it('refuses a name another role has', async () => {
    const { screen } = await openRoles();

    await screen.getByRole('button', { name: 'New role' }).click();
    const dialog = screen.getByRole('dialog', { name: 'New role' });
    await dialog.getByRole('button', { name: 'Create the role' }).click();
    await expect.element(dialog.getByText('This field is required.')).toBeVisible();
    await dialog.getByLabelText('Name').fill('team');
    await dialog.getByRole('button', { name: 'Create the role' }).click();

    await expect.element(dialog.getByText('Another role already has this name.')).toBeVisible();
  });

  it('renames a role from its menu', async () => {
    const { screen } = await openRoles();

    await screen.getByRole('button', { name: 'Actions for Requester' }).click();
    await screen.getByRole('menuitem', { name: 'Edit' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Edit Requester' });
    await dialog.getByLabelText('Name').fill('Customer');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(control('Create issues', 'Customer')).toBeChecked();
    await expect
      .element(screen.getByRole('button', { name: 'Actions for Customer' }))
      .toHaveFocus();
  });

  it('deletes a role nobody has, after confirming', async () => {
    const { screen } = await openRoles();

    await screen.getByRole('button', { name: 'Actions for Requester' }).click();
    await screen.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Delete Requester?' });
    await expect
      .element(dialog)
      .toHaveAccessibleDescription('Nobody has this role. Deleting it cannot be undone.');
    await dialog.getByRole('button', { name: 'Delete the role' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(control('Create issues', 'Requester')).not.toBeInTheDocument();
  });

  it('explains why a role someone has cannot be deleted', async () => {
    const { screen } = await openRoles();

    await screen.getByRole('button', { name: 'Actions for Team' }).click();
    await screen.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Delete Team?' });

    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        'Still used by 1 member. Give them another role first, from the members list or the projects.',
      );
    await expect
      .element(dialog.getByRole('button', { name: 'Delete the role' }))
      .not.toBeInTheDocument();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Actions for Team' })).toHaveFocus();
  });

  it('asks before leaving with unsaved changes', async () => {
    const { screen, router } = await openRoles();
    const membersLink = screen
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: 'Members' });
    await control('Delete issues', 'Team').click();

    await membersLink.click();
    const dialog = screen.getByRole('dialog', { name: 'Leave without saving?' });
    await dialog.getByRole('button', { name: 'Stay' }).click();
    expect(router.state.location.pathname).toBe('/settings/roles');
    await expect.element(control('Delete issues', 'Team')).toBeChecked();

    await membersLink.click();
    await screen
      .getByRole('dialog', { name: 'Leave without saving?' })
      .getByRole('button', { name: 'Leave without saving' })
      .click();
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
  });

  it('shows one role at a time on phones', async () => {
    await page.viewport(375, 812);
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/roles' });
    const tabs = screen.getByRole('group', { name: 'Role shown' });

    await expect.element(control('Create issues', 'Administrator')).toBeVisible();
    await tabs.getByRole('button', { name: 'Requester' }).click();

    await expect
      .element(tabs.getByRole('button', { name: 'Requester' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect.element(control('Create issues', 'Requester')).toBeChecked();
    await expect.element(control('Create issues', 'Team')).not.toBeInTheDocument();
  });

  it('is left to the system role', async () => {
    fakeServer({ user: { ...GRACE, permissions: ['instance.users.manage'] } });
    const { screen } = await renderApp({ path: '/settings/roles' });

    await expect
      .element(screen.getByRole('heading', { name: 'You do not have access to this page' }))
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Settings sections' })
          .getByRole('link', { name: 'Roles and permissions' }),
      )
      .not.toBeInTheDocument();
  });
});

describe('the permissions of plugins', () => {
  const TIME_TRACKING = {
    slug: 'time-tracking',
    name: 'Time tracking',
    permissions: [
      {
        name: 'time-tracking.entries.log',
        scope: 'project',
        label: { en: 'Log time', fr: 'Saisir du temps' },
      },
    ],
  } as const satisfies PluginPermissionSection;

  it('show in a section per plugin, after Toppo’s, given to a role like any other', async () => {
    const server = fakeServer({ user: ADA, plugins: [TIME_TRACKING] });
    const { screen } = await renderApp({ path: '/settings/roles' });

    // The last group of rows: Toppo's sections come first.
    const section = screen.getByRole('rowgroup').last();
    await expect
      .element(section.getByRole('cell').first())
      .toHaveTextContent('Time trackingPermissions this plugin adds.');
    await expect
      .element(
        section.getByRole('rowheader', {
          name: 'Log time Applies in each project the member has access to.',
        }),
      )
      .toBeVisible();
    await expect.element(control('Log time', 'Administrator')).toBeChecked();
    await expect.element(control('Log time', 'Administrator')).toBeDisabled();
    await expect.element(control('Log time', 'Team')).not.toBeChecked();

    await control('Log time', 'Team').click();
    await expect.element(screen.getByText('1 unsaved change')).toBeVisible();
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByText('Permissions saved.')).toBeVisible();
    const save = server.requests.find(({ method }) => method === 'PUT');
    expect(save?.body).toMatchObject({
      changes: [
        {
          roleId: DEFAULT_ROLE_IDS.team,
          to: expect.arrayContaining(['issue.create', 'time-tracking.entries.log']),
        },
      ],
    });
    await expect.element(control('Log time', 'Team')).toBeChecked();
  });

  it('are named in the plugin’s own words, in the language shown, on phones too', async () => {
    await page.viewport(375, 812);
    fakeServer({ user: { ...ADA, locale: 'fr' }, plugins: [TIME_TRACKING] });
    const { screen } = await renderApp({ path: '/settings/roles', locale: 'fr' });

    const section = screen.getByRole('region', { name: 'Time tracking' });
    await expect.element(section.getByText('Permissions ajoutées par ce plugin.')).toBeVisible();
    await expect
      .element(section.getByText('S’applique dans chaque projet auquel le membre a accès.'))
      .toBeVisible();
    // Role names are the instance's own, in no language.
    await expect.element(control('Saisir du temps', 'Administrator')).toBeChecked();
  });
});

describe('new issue notifications', () => {
  it('are on for the team by default, and any role turns them on or off, the system role too', async () => {
    const { server, screen } = await openRoles();

    await expect.element(control('New issues', 'Administrator')).toBeChecked();
    await expect.element(control('New issues', 'Team')).toBeChecked();
    await expect.element(control('New issues', 'Requester')).not.toBeChecked();
    await expect.element(control('Create issues', 'Administrator')).toBeDisabled();
    await control('New issues', 'Administrator').click();
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByText('Permissions saved.')).toBeVisible();
    await expect.element(control('New issues', 'Administrator')).not.toBeChecked();
    const save = server.requests.find(({ method }) => method === 'PUT');
    expect(save?.body).toMatchObject({
      changes: [
        {
          roleId: DEFAULT_ROLE_IDS.administrator,
          notifyNewIssues: { from: true, to: false },
        },
      ],
    });
  });
});
