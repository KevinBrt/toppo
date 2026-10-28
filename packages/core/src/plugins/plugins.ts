import { ALL_PERMISSIONS } from '../permissions/catalog.ts';

/**
 * Ids no plugin may take. Its permissions are named after it (`time-tracking.reports.read`), so
 * it cannot take a resource of Toppo's own (`issue`, `project`…): `issue.read` would be its.
 */
const RESERVED_PLUGIN_IDS: ReadonlySet<string> = new Set([
  'toppo',
  ...ALL_PERMISSIONS.map((permission) => permission.slice(0, permission.indexOf('.'))),
]);

export function isReservedPluginId(id: string): boolean {
  return RESERVED_PLUGIN_IDS.has(id);
}

/**
 * A plugin's own user, as people see what it writes: `time-tracking` is "Time tracking". Its
 * address is under `.invalid`, a domain that reaches no one (RFC 2606).
 */
export function pluginUserOf(id: string): { name: string; email: string } {
  const words = id.split('-').filter(Boolean).join(' ');
  return {
    name: `${words.charAt(0).toUpperCase()}${words.slice(1)}`,
    email: `${id}@plugins.invalid`,
  };
}

/** What an administrator approves of a plugin, as its manifest declares it. */
export interface PluginGrants {
  /** What it reads and writes through Toppo: `issue.read`, `comment.create`… */
  needs: readonly string[];
  /** The permissions it adds to the catalog, and where each applies. */
  permissions: Readonly<Record<string, { scope: string }>>;
  /** The events it hears of, each telling it of the issues it concerns. */
  events: readonly string[];
}

/**
 * Whether a new version asks for what the approved one did not: a need, a permission (or a wider
 * scope for one) or an event. It then waits for a new approval; asking for the same or less, it
 * takes the place of the approved one at once.
 */
export function asksForMore(approved: PluginGrants, upgrade: PluginGrants): boolean {
  const isNew = (had: readonly string[]) => (item: string) => !had.includes(item);
  return (
    upgrade.needs.some(isNew(approved.needs)) ||
    upgrade.events.some(isNew(approved.events)) ||
    Object.entries(upgrade.permissions).some(
      ([name, { scope }]) =>
        !Object.hasOwn(approved.permissions, name) ||
        (scope === 'instance' && approved.permissions[name]?.scope !== 'instance'),
    )
  );
}
