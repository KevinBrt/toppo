import type { z } from 'zod';
import type { ActionContext, Context, Entities } from './context.ts';
import type { MessagesOf } from './messages.ts';
import type { Properties } from './property.ts';
import type { PluginNeed } from './protocol/calls.ts';
import type { JobEvery } from './protocol/declarations/jobs.ts';
import type { RouteAnswer } from './protocol/declarations/routes.ts';
import type { EventType } from './protocol/events.ts';
import type { accessSchema, Messages } from './protocol/manifest.ts';
import type { PluginLogo } from './protocol/package.ts';
import type { RouteRequest } from './routes/route.ts';
import type { DialogDefinition, PageDefinition, PanelDefinition } from './screens/screens.ts';

/** What `definePlugin` keeps of a plugin, for `servePlugin` to answer Toppo with. */
export interface PluginDefinition {
  config: {
    id: string;
    name: string;
    description: string;
    logo?: PluginLogo | undefined;
    apiVersion: string;
    needs?: readonly PluginNeed[] | undefined;
    permissions?:
      | Readonly<Record<string, { scope: 'instance' | 'project'; label: string }>>
      | undefined;
    http?: readonly string[] | { fromSettings: readonly string[] } | 'any' | undefined;
    messages: { en: Messages; fr: MessagesOf<Messages> };
  };
  settings: z.ZodType;
  projectSettings: z.ZodType;
  entities: Entities;
  properties: Properties;
  actions: Map<
    string,
    {
      access: z.infer<typeof accessSchema>;
      input: z.ZodType;
      handler(ctx: ActionContext<z.ZodType, Messages>, input: unknown): Promise<unknown>;
    }
  >;
  events: Map<EventType, (ctx: Context<z.ZodType, Messages>, payload: unknown) => Promise<void>>;
  /** Its screens, by name, in the order they were defined. */
  pages: Map<string, PageDefinition>;
  panels: Map<string, PanelDefinition>;
  /** Its dialogs, by name, opened over the page by its screens. */
  dialogs: Map<string, DialogDefinition>;
  /** What it does on its own, by name. */
  jobs: Map<
    string,
    { every: JobEvery; label: string; handler(ctx: Context<z.ZodType, Messages>): Promise<void> }
  >;
  /** Where services outside Toppo call it, by name. */
  routes: Map<
    string,
    { handler(ctx: Context<z.ZodType, Messages>, request: RouteRequest): Promise<RouteAnswer> }
  >;
}

const definitions = new WeakMap<object, PluginDefinition>();

export function register(plugin: object, definition: PluginDefinition): void {
  definitions.set(plugin, definition);
}

/** What `definePlugin` registered for a plugin. */
export function definitionOf(plugin: object): PluginDefinition {
  const definition = definitions.get(plugin);
  if (!definition) {
    throw new Error('Not a plugin: make it with definePlugin()');
  }
  return definition;
}
