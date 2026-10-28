import { ALL_PERMISSIONS } from '@toppo-tracker/core';
import type { PluginPermissionSection, RoleDetails } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  changesToSave,
  countChanges,
  issueVisibilityOf,
  matrixOf,
  settingsOfRole,
  withIssueVisibility,
  withPermission,
} from './permission-matrix.util.ts';

const TIME_TRACKING: PluginPermissionSection = {
  slug: 'time-tracking',
  name: { en: 'Time tracking', fr: 'Suivi du temps' },
  permissions: [
    {
      name: 'time-tracking.entries.log',
      scope: 'project',
      label: { en: 'Log time', fr: 'Saisir du temps' },
    },
    {
      name: 'time-tracking.reports.read',
      scope: 'instance',
      label: { en: 'Read the reports', fr: 'Lire les rapports' },
    },
  ],
};

const TOPPO = matrixOf([]);
const WITH_PLUGIN = matrixOf([TIME_TRACKING]);

describe('the matrix', () => {
  it('shows every permission once, the two that read issues as one choice, then notifications', () => {
    expect(
      TOPPO.sections.map((section) => ({
        section: section.kind === 'core' ? section.section : section.slug,
        scope: section.kind === 'core' ? section.scope : null,
        rows: section.rows.map((row) =>
          row.kind === 'permission' || row.kind === 'pluginPermission' ? row.permission : row.kind,
        ),
      })),
    ).toStrictEqual([
      {
        section: 'tickets',
        scope: 'project',
        rows: ['issueVisibility', 'issue.create', 'issue.update', 'issue.assign', 'issue.delete'],
      },
      { section: 'conversation', scope: 'project', rows: ['comment.create', 'comment.moderate'] },
      {
        section: 'project',
        scope: 'project',
        rows: ['project.settings.manage', 'project.members.manage'],
      },
      {
        section: 'organisation',
        scope: 'instance',
        rows: [
          'instance.users.manage',
          'project.create',
          'project.delete',
          'instance.settings.manage',
          'instance.mail.manage',
          'instance.roles.manage',
          'instance.plugins.manage',
        ],
      },
      { section: 'notifications', scope: 'project', rows: ['notifyNewIssues'] },
    ]);
  });

  it('adds a section per plugin after Toppo’s, its permissions in its own words', () => {
    expect(WITH_PLUGIN.sections.slice(0, -1)).toStrictEqual(TOPPO.sections);
    expect(WITH_PLUGIN.sections.at(-1)).toStrictEqual({
      kind: 'plugin',
      slug: 'time-tracking',
      name: { en: 'Time tracking', fr: 'Suivi du temps' },
      rows: [
        {
          kind: 'pluginPermission',
          permission: 'time-tracking.entries.log',
          scope: 'project',
          label: { en: 'Log time', fr: 'Saisir du temps' },
        },
        {
          kind: 'pluginPermission',
          permission: 'time-tracking.reports.read',
          scope: 'instance',
          label: { en: 'Read the reports', fr: 'Lire les rapports' },
        },
      ],
    });
  });

  it('shows what a role grants, a plugin’s permissions included, the system role all of them', () => {
    const role: RoleDetails = {
      id: 'team',
      name: 'Team',
      color: 'blue',
      grantsAll: false,
      permissions: ['time-tracking.entries.log', 'issue.create', 'gone.plugin.read'],
      notifyNewIssues: false,
      memberCount: 0,
      invitationCount: 0,
      projectCount: 0,
    };

    expect(settingsOfRole(role, WITH_PLUGIN).permissions).toStrictEqual([
      'issue.create',
      'time-tracking.entries.log',
    ]);
    expect(settingsOfRole({ ...role, grantsAll: true }, WITH_PLUGIN).permissions).toStrictEqual([
      ...ALL_PERMISSIONS,
      'time-tracking.entries.log',
      'time-tracking.reports.read',
    ]);
  });
});

describe('issue visibility', () => {
  it('reads all, own or none from the permissions', () => {
    expect(issueVisibilityOf(['issue.read', 'issue.read.own'])).toBe('all');
    expect(issueVisibilityOf(['issue.read'])).toBe('all');
    expect(issueVisibilityOf(['issue.read.own', 'issue.create'])).toBe('own');
    expect(issueVisibilityOf(['issue.create'])).toBe('none');
  });

  it('writes it back, keeping the other permissions in catalog order', () => {
    expect(
      withIssueVisibility(['time-tracking.entries.log', 'issue.read.own'], 'all', WITH_PLUGIN),
    ).toStrictEqual(['issue.read', 'issue.read.own', 'time-tracking.entries.log']);
    expect(withIssueVisibility(['issue.read', 'issue.read.own'], 'own', TOPPO)).toStrictEqual([
      'issue.read.own',
    ]);
    expect(withIssueVisibility(['issue.read', 'comment.create'], 'none', TOPPO)).toStrictEqual([
      'comment.create',
    ]);
  });
});

describe('withPermission', () => {
  it('grants or withdraws one permission, in catalog order, Toppo’s then the plugins’', () => {
    expect(withPermission(['comment.create'], 'issue.create', true, TOPPO)).toStrictEqual([
      'issue.create',
      'comment.create',
    ]);
    expect(
      withPermission(['issue.create', 'comment.create'], 'issue.create', false, TOPPO),
    ).toStrictEqual(['comment.create']);
    expect(withPermission(['issue.create'], 'issue.create', true, TOPPO)).toStrictEqual([
      'issue.create',
    ]);
    expect(
      withPermission(['time-tracking.reports.read'], 'issue.create', true, WITH_PLUGIN),
    ).toStrictEqual(['issue.create', 'time-tracking.reports.read']);
  });
});

describe('unsaved changes', () => {
  const settings = (permissions: readonly string[], notifyNewIssues = false) => ({
    permissions,
    notifyNewIssues,
  });
  const drafts = {
    team: {
      from: settings(['issue.read', 'issue.read.own', 'issue.create'], true),
      to: settings(['issue.read.own', 'project.create', 'time-tracking.entries.log'], true),
    },
    requester: { from: settings(['issue.create']), to: settings(['issue.create']) },
    administrator: { from: settings(ALL_PERMISSIONS, true), to: settings(ALL_PERMISSIONS, false) },
  };

  it('counts each cell that changed, the issue visibility as one, a plugin’s permissions too', () => {
    expect(countChanges(drafts, WITH_PLUGIN)).toBe(5);
    expect(countChanges({}, WITH_PLUGIN)).toBe(0);
  });

  it('saves only the roles that changed, from what was shown', () => {
    expect(changesToSave(drafts)).toStrictEqual([
      {
        roleId: 'team',
        from: ['issue.read', 'issue.read.own', 'issue.create'],
        to: ['issue.read.own', 'project.create', 'time-tracking.entries.log'],
      },
      {
        roleId: 'administrator',
        from: [...ALL_PERMISSIONS],
        to: [...ALL_PERMISSIONS],
        notifyNewIssues: { from: true, to: false },
      },
    ]);
  });
});
