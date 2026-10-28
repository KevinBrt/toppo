import type { PluginPermission } from './catalog.ts';
import { permissionsOfRole, type RoleGrants, scopeOf } from './grants.ts';

/** What decides whether, and how, a member works in a project. */
export interface ProjectAccess {
  /** The member's own role. */
  role: RoleGrants;
  /** Given every project, present and future. */
  allProjects: boolean;
  /** Their line in the project's members, if any, and the role the project gives them there. */
  membership: { role: RoleGrants | null } | null;
}

/**
 * Whether a member reaches a project. The system role reaches every project, so that an
 * administrator can always administer it.
 */
export function canReachProject({ role, allProjects, membership }: ProjectAccess): boolean {
  return role.grantsAll || allProjects || membership !== null;
}

/**
 * The role someone works with in a project: the one the project gives them, or else their own.
 * The system role stays theirs whatever the project gives.
 */
export function roleInProject<Role extends { grantsAll: boolean }>(
  own: Role,
  given: Role | null | undefined,
): Role {
  return own.grantsAll ? own : (given ?? own);
}

/**
 * What a member may do inside a project, or `null` when they cannot reach it. The role the
 * project gives them replaces their own there, and grants project permissions only: what applies
 * to the whole instance comes from their own role alone. The system role keeps everything. The
 * permissions of the plugins approved (`plugins`) count as Toppo's own.
 */
export function projectPermissionsOf(
  access: ProjectAccess,
  plugins: readonly PluginPermission[],
): string[] | null {
  if (!canReachProject(access)) {
    return null;
  }
  return projectPermissionsOfRole(roleInProject(access.role, access.membership?.role), plugins);
}

function projectPermissionsOfRole(
  role: RoleGrants,
  plugins: readonly PluginPermission[],
): string[] {
  return permissionsOfRole(role, plugins).filter(
    (permission) => scopeOf(permission, plugins) === 'project',
  );
}

/**
 * Whether someone with `permissions` in a project may act on a member whose role there is `role`,
 * or let a member work there with it: never beyond what they hold themselves, so that managing a
 * project's members gives no way to more rights.
 */
export function canActOnProjectMember(
  permissions: readonly string[],
  role: RoleGrants,
  plugins: readonly PluginPermission[],
): boolean {
  return projectPermissionsOfRole(role, plugins).every((permission) =>
    permissions.includes(permission),
  );
}

/**
 * Whether someone with `permissions` in a project may give `role` there. Never the system role,
 * which applies to the whole instance, and never more than they hold.
 */
export function canGiveProjectRole(
  permissions: readonly string[],
  role: RoleGrants,
  plugins: readonly PluginPermission[],
): boolean {
  return !role.grantsAll && canActOnProjectMember(permissions, role, plugins);
}
