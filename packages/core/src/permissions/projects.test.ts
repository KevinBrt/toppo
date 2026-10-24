import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, isProjectPermission } from './catalog.ts';
import {
  canActOnProjectMember,
  canGiveProjectRole,
  canReachProject,
  type ProjectAccess,
  projectPermissionsOf,
  roleInProject,
} from './projects.ts';

const role = (...permissions: string[]) => ({ grantsAll: false, permissions });
const SYSTEM_ROLE = { grantsAll: true, permissions: [] };
const TEAM = role('issue.read', 'issue.create', 'comment.create', 'project.create');
const READ_ONLY = role('issue.read', 'instance.users.manage');

const access = (overrides: Partial<ProjectAccess> = {}): ProjectAccess => ({
  role: TEAM,
  allProjects: false,
  membership: null,
  ...overrides,
});

describe('canReachProject', () => {
  it('lets in the members of the project, those given every project, and the system role', () => {
    expect(canReachProject(access())).toBe(false);
    expect(canReachProject(access({ membership: { role: null } }))).toBe(true);
    expect(canReachProject(access({ allProjects: true }))).toBe(true);
    expect(canReachProject(access({ role: SYSTEM_ROLE }))).toBe(true);
  });
});

describe('projectPermissionsOf', () => {
  it('answers null for a project out of reach', () => {
    expect(projectPermissionsOf(access())).toBeNull();
  });

  it('applies the member’s own role, without what concerns the whole instance', () => {
    expect(projectPermissionsOf(access({ allProjects: true }))).toStrictEqual([
      'issue.read',
      'issue.create',
      'comment.create',
    ]);
  });

  it('applies the role the project gives instead, project permissions only', () => {
    expect(projectPermissionsOf(access({ membership: { role: READ_ONLY } }))).toStrictEqual([
      'issue.read',
    ]);
  });

  it('keeps every project permission for the system role, whatever the project gives', () => {
    expect(
      projectPermissionsOf(access({ role: SYSTEM_ROLE, membership: { role: READ_ONLY } })),
    ).toStrictEqual(ALL_PERMISSIONS.filter(isProjectPermission));
  });
});

describe('roleInProject', () => {
  it('is the role the project gives, else one’s own, the system role whatever is given', () => {
    expect(roleInProject(TEAM, READ_ONLY)).toBe(READ_ONLY);
    expect(roleInProject(TEAM, null)).toBe(TEAM);
    expect(roleInProject(SYSTEM_ROLE, READ_ONLY)).toBe(SYSTEM_ROLE);
  });
});

describe('managing a project’s members', () => {
  const manager = ['issue.read', 'issue.create', 'project.members.manage'] as const;

  it('allows roles within what the manager holds there, whatever they grant instance-wide', () => {
    expect(canGiveProjectRole(manager, role('issue.read'))).toBe(true);
    expect(canGiveProjectRole(manager, role('issue.read', 'instance.users.manage'))).toBe(true);
    expect(canGiveProjectRole(manager, role())).toBe(true);
  });

  it('refuses a role granting more than the manager holds there', () => {
    expect(canGiveProjectRole(manager, role('issue.read', 'issue.delete'))).toBe(false);
    expect(canActOnProjectMember(manager, role('issue.delete'))).toBe(false);
  });

  it('never gives the system role in a project, nor lets a lesser manager touch its holders', () => {
    const everything = ALL_PERMISSIONS.filter(isProjectPermission);

    expect(canGiveProjectRole(everything, SYSTEM_ROLE)).toBe(false);
    expect(canActOnProjectMember(everything, SYSTEM_ROLE)).toBe(true);
    expect(canActOnProjectMember(manager, SYSTEM_ROLE)).toBe(false);
  });
});
