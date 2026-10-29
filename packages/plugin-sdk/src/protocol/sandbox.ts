/**
 * How Toppo and a plugin's bundle meet in the sandbox: two globals, and strings of JSON between
 * them. Nothing else is shared.
 */

/** The global the SDK defines in a plugin's bundle, through which Toppo asks it. */
export const PLUGIN_GLOBAL = '__toppo';

/** The global Toppo defines in the sandbox: the plugin's one way out. */
export const HOST_GLOBAL = '__host';

/**
 * What Toppo asks a plugin to run: an action, an event, one of its jobs, or a check of settings
 * before Toppo saves them: `instance`, `project` (each answers what did not fit), or `projects`
 * (those saved for each project, by its id, as an upgrade checks them: it answers the ids it
 * refuses).
 */
export type RunKind = 'action' | 'event' | 'job' | 'settings';

/** `__toppo`: what the plugin answers Toppo. */
export interface PluginGlobal {
  /** The manifest, as JSON. */
  manifest(): string;
  /** A run's answer (`RunAnswer`), as JSON; its payload and context come as JSON too. */
  run(kind: RunKind, name: string, payload: string, context: string): Promise<string>;
}

/** `__host`: what Toppo answers the plugin. */
export interface HostGlobal {
  /** Toppo's answer as JSON; rejected with Toppo's code (`FORBIDDEN`…) when it refuses. */
  call(method: string, args: string): Promise<string>;
}
