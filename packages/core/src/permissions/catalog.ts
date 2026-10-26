/** Where a permission applies: in the whole instance, or inside the projects a member reaches. */
export const PERMISSION_SCOPES = ['instance', 'project'] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/** Groups of the roles and permissions matrix, in display order. */
export const PERMISSION_SECTIONS = ['tickets', 'conversation', 'project', 'organisation'] as const;

export type PermissionSection = (typeof PERMISSION_SECTIONS)[number];

export interface PermissionDefinition {
  scope: PermissionScope;
  section: PermissionSection;
  /** Held by the system role only: no other role may be given it. */
  systemOnly?: true;
}

/**
 * Every permission Toppo checks, as `resource.action`, in display order. Code always checks one
 * of these, never a role name. Plugins will register theirs here too.
 */
export const PERMISSIONS = {
  'issue.read': { scope: 'project', section: 'tickets' },
  'issue.read.own': { scope: 'project', section: 'tickets' },
  'issue.create': { scope: 'project', section: 'tickets' },
  'issue.update': { scope: 'project', section: 'tickets' },
  'issue.assign': { scope: 'project', section: 'tickets' },
  'issue.delete': { scope: 'project', section: 'tickets' },
  'comment.create': { scope: 'project', section: 'conversation' },
  'comment.moderate': { scope: 'project', section: 'conversation' },
  'project.settings.manage': { scope: 'project', section: 'project' },
  'project.members.manage': { scope: 'project', section: 'project' },
  'instance.users.manage': { scope: 'instance', section: 'organisation' },
  'project.create': { scope: 'instance', section: 'organisation' },
  // Takes a project's issues and their history with it, for good.
  'project.delete': { scope: 'instance', section: 'organisation' },
  'instance.settings.manage': { scope: 'instance', section: 'organisation' },
  // The mail server carries every password-reset and invitation link, administrators' included:
  // whoever chooses it can take any account, so only administrators may.
  'instance.mail.manage': { scope: 'instance', section: 'organisation', systemOnly: true },
  // Whoever edits roles can give themselves anything: only administrators may.
  'instance.roles.manage': { scope: 'instance', section: 'organisation', systemOnly: true },
} as const satisfies Record<string, PermissionDefinition>;

export type Permission = keyof typeof PERMISSIONS;

/** A permission that applies in the whole instance, granted by the member's role. */
export type InstancePermission = {
  [P in Permission]: (typeof PERMISSIONS)[P]['scope'] extends 'instance' ? P : never;
}[Permission];

/** A permission that applies inside one project, granted by the role the member has there. */
export type ProjectPermission = Exclude<Permission, InstancePermission>;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as readonly Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

export function isInstancePermission(value: string): value is InstancePermission {
  return isPermission(value) && PERMISSIONS[value].scope === 'instance';
}

export function isProjectPermission(value: string): value is ProjectPermission {
  return isPermission(value) && PERMISSIONS[value].scope === 'project';
}
