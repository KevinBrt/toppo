import { isProjectPermission, type ProjectPermission } from './catalog.ts';
import { can, permissionsOfRole, type RoleGrants } from './grants.ts';

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
 * to the whole instance comes from their own role alone. The system role keeps everything.
 */
export function projectPermissionsOf(access: ProjectAccess): ProjectPermission[] | null {
  if (!canReachProject(access)) {
    return null;
  }
  return permissionsOfRole(roleInProject(access.role, access.membership?.role)).filter(
    isProjectPermission,
  );
}

/**
 * Whether someone with `permissions` in a project may act on a member whose role there is `role`,
 * or let a member work there with it: never beyond what they hold themselves, so that managing a
 * project's members gives no way to more rights.
 */
export function canActOnProjectMember(
  permissions: readonly ProjectPermission[],
  role: RoleGrants,
): boolean {
  return permissionsOfRole(role)
    .filter(isProjectPermission)
    .every((permission) => can(permissions, permission));
}

/**
 * Whether someone with `permissions` in a project may give `role` there. Never the system role,
 * which applies to the whole instance, and never more than they hold.
 */
export function canGiveProjectRole(
  permissions: readonly ProjectPermission[],
  role: RoleGrants,
): boolean {
  return !role.grantsAll && canActOnProjectMember(permissions, role);
}
