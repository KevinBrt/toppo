import { ALL_PERMISSIONS, type Permission } from '@toppo-tracker/core';
import { describe, expect, it } from 'vitest';
import {
  changesToSave,
  countChanges,
  issueVisibilityOf,
  MATRIX_SECTIONS,
  withIssueVisibility,
  withPermission,
} from './permission-matrix.util.ts';

describe('MATRIX_SECTIONS', () => {
  it('shows every permission once, the two that read issues as one choice, then notifications', () => {
    expect(
      MATRIX_SECTIONS.map(({ section, scope, rows }) => ({
        section,
        scope,
        rows: rows.map((row) => (row.kind === 'permission' ? row.permission : row.kind)),
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
        ],
      },
      { section: 'notifications', scope: 'project', rows: ['notifyNewIssues'] },
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
    expect(withIssueVisibility(['comment.create', 'issue.read.own'], 'all')).toStrictEqual([
      'issue.read',
      'issue.read.own',
      'comment.create',
    ]);
    expect(withIssueVisibility(['issue.read', 'issue.read.own'], 'own')).toStrictEqual([
      'issue.read.own',
    ]);
    expect(withIssueVisibility(['issue.read', 'comment.create'], 'none')).toStrictEqual([
      'comment.create',
    ]);
  });
});

describe('withPermission', () => {
  it('grants or withdraws one permission, in catalog order', () => {
    expect(withPermission(['comment.create'], 'issue.create', true)).toStrictEqual([
      'issue.create',
      'comment.create',
    ]);
    expect(withPermission(['issue.create', 'comment.create'], 'issue.create', false)).toStrictEqual(
      ['comment.create'],
    );
    expect(withPermission(['issue.create'], 'issue.create', true)).toStrictEqual(['issue.create']);
  });
});

describe('unsaved changes', () => {
  const settings = (permissions: readonly Permission[], notifyNewIssues = false) => ({
    permissions,
    notifyNewIssues,
  });
  const drafts = {
    team: {
      from: settings(['issue.read', 'issue.read.own', 'issue.create'], true),
      to: settings(['issue.read.own', 'project.create'], true),
    },
    requester: { from: settings(['issue.create']), to: settings(['issue.create']) },
    administrator: { from: settings(ALL_PERMISSIONS, true), to: settings(ALL_PERMISSIONS, false) },
  };

  it('counts each cell that changed, the issue visibility as one', () => {
    expect(countChanges(drafts)).toBe(4);
    expect(countChanges({})).toBe(0);
  });

  it('saves only the roles that changed, from what was shown', () => {
    expect(changesToSave(drafts)).toStrictEqual([
      {
        roleId: 'team',
        from: ['issue.read', 'issue.read.own', 'issue.create'],
        to: ['issue.read.own', 'project.create'],
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
