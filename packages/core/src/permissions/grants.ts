import {
  ALL_PERMISSIONS,
  isInstancePermission,
  isProjectPermission,
  PERMISSIONS,
  type Permission,
  type PermissionDefinition,
  type PermissionScope,
  type PluginPermission,
} from './catalog.ts';

/** What decides the permissions a role grants. */
export interface RoleGrants {
  grantsAll: boolean;
  permissions: readonly string[];
}

/**
 * Whether `granted` includes `permission`: the one decision the server enforces and the web app
 * mirrors to hide what a user cannot do.
 */
export function can(granted: readonly string[], permission: Permission): boolean {
  return granted.includes(permission);
}

/** Whether `granted` includes at least one of `permissions`, e.g. to show a menu with several sections. */
export function canAny(granted: readonly string[], permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(granted, permission));
}

/** Whether a role may be given `permission`; the system role has them all anyway. */
export function canBeGranted(permission: Permission): boolean {
  const definition: PermissionDefinition = PERMISSIONS[permission];
  return definition.systemOnly !== true;
}

/**
 * What a role really grants, from what is stored on it, in catalog order: Toppo's permissions,
 * then those of the plugins approved (`plugins`). The system role grants everything; otherwise a
 * permission the catalog does not know now (its plugin waits for an approval, or was removed), or
 * one only the system role may hold, grants nothing.
 */
export function permissionsOfRole(
  { grantsAll, permissions }: RoleGrants,
  plugins: readonly PluginPermission[],
): string[] {
  return grantsAll
    ? [...ALL_PERMISSIONS, ...plugins.map(({ name }) => name)]
    : rolePermissionsFrom(permissions, plugins).permissions;
}

/**
 * What a role may store out of `requested`: the permissions it may be given, Toppo's or those of
 * the plugins approved, once each, in catalog order. `refused` lists the rest (unknown, or held by
 * the system role only), for the caller to report rather than drop silently.
 */
export function rolePermissionsFrom(
  requested: readonly string[],
  plugins: readonly PluginPermission[],
): { permissions: string[]; refused: string[] } {
  const grantable: readonly string[] = [
    ...ALL_PERMISSIONS.filter(canBeGranted),
    ...plugins.map(({ name }) => name),
  ];
  return {
    permissions: grantable.filter((permission) => requested.includes(permission)),
    refused: [...new Set(requested.filter((value) => !grantable.includes(value)))],
  };
}

/** Where `permission` applies: Toppo's own by its catalog, a plugin's as the plugin declared. */
export function scopeOf(
  permission: string,
  plugins: readonly PluginPermission[],
): PermissionScope | undefined {
  if (isInstancePermission(permission)) {
    return 'instance';
  }
  if (isProjectPermission(permission)) {
    return 'project';
  }
  return plugins.find(({ name }) => name === permission)?.scope;
}

/** The permissions a member's role grants in the whole instance. */
export function instancePermissionsOf(
  role: RoleGrants,
  plugins: readonly PluginPermission[],
): string[] {
  return permissionsOfRole(role, plugins).filter(
    (permission) => scopeOf(permission, plugins) === 'instance',
  );
}
