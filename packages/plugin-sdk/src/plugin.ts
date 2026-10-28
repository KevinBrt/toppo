import { z } from 'zod';
import type { ActionContext, Context } from './context.ts';
import { type PluginDefinition, register } from './definition.ts';
import type { MessageKey, MessagesOf } from './messages.ts';
import type { PluginNeed } from './protocol/calls.ts';
import type { EventPayload, EventType } from './protocol/events.ts';
import type { Messages } from './protocol/manifest.ts';
import type { PluginLogo } from './protocol/package.ts';
import { HOST_GLOBAL, type HostGlobal, PLUGIN_GLOBAL } from './protocol/sandbox.ts';
import { servePlugin } from './serve.ts';

type Scope = 'instance' | 'project';

/** A plugin's own permissions, by their short name: `reports.read`. */
export type PermissionDefinitions<M> = Record<string, { scope: Scope; label: MessageKey<M> }>;

type PermissionOf<P> = (keyof P & string) | PluginNeed;

/** The fields of an input that hold a string: those that may name an issue. */
type StringFieldOf<T> = { [K in keyof T]-?: T[K] extends string ? K : never }[keyof T] & string;

/**
 * Who may run an action: anyone signed in, those who hold a permission, or those who see the
 * issue its input names (Toppo answers 404 to the others), with a permission or not.
 */
export type Access<P, Input> =
  | 'authenticated'
  | { permission: PermissionOf<P> }
  | { issue: StringFieldOf<Input>; permission?: PermissionOf<P> };

const NO_SETTINGS = z.object({});

export interface PluginConfig<
  M extends Messages,
  P extends PermissionDefinitions<M>,
  S extends z.ZodType,
> {
  /** `time-tracking`: lowercase words joined by dashes. */
  id: string;
  /** What it is called, and what it does in a sentence: shown to who approves and uses it. */
  name: MessageKey<M>;
  description: MessageKey<M>;
  /** Its logo, `logo.png` or `logo.webp` beside its `package.json`: PNG or WebP, 256 KB at most. */
  logo?: PluginLogo;
  /** The plugin API it was written for: `^1.0`. */
  apiVersion: string;
  /** The core permissions it uses, which the administrator approves: its ceiling. */
  needs?: readonly PluginNeed[];
  /** The permissions it adds to Toppo's, which administrators give to roles. */
  permissions?: P;
  /** What the administrator sets, as a Zod schema: Toppo builds the form from it. */
  settings?: S;
  messages: { en: M; fr: MessagesOf<M> };
}

export interface Action<I extends z.ZodType, R> {
  readonly name: string;
  readonly input: I;
  /** Never read: carries the type of what the action answers. */
  readonly result?: R;
}

export interface EventHandler<T extends EventType> {
  readonly event: T;
}

export interface Plugin<
  M extends Messages,
  P extends PermissionDefinitions<M>,
  S extends z.ZodType,
> {
  readonly id: string;
  readonly settings: S;
  readonly messages: { readonly en: M; readonly fr: MessagesOf<M> };
  /** What the plugin's screens call: Toppo checks `access`, the SDK the input, then it runs. */
  defineAction<I extends z.ZodType, R>(definition: {
    /** `timeEntry.log`: a resource, a dot, an action. */
    name: string;
    access: Access<P, z.input<I>>;
    input: I;
    handler(ctx: ActionContext<S, M>, input: z.output<I>): Promise<R>;
  }): Action<I, R>;
  /** What the plugin does when something happens to an issue, in the background. */
  defineEventHandler<T extends EventType>(definition: {
    event: T;
    handler(ctx: Context<S, M>, payload: EventPayload<T>): Promise<void>;
  }): EventHandler<T>;
}

/**
 * Declares a plugin: what it is, may do, adds and says. Its actions and event handlers are then
 * defined on it, in any file: `plugin.defineAction({ … })`.
 */
export function definePlugin<
  const M extends Messages,
  const P extends PermissionDefinitions<M> = Record<never, never>,
  S extends z.ZodType = typeof NO_SETTINGS,
>(config: PluginConfig<M, P, S>): Plugin<M, P, S> {
  const settings = config.settings ?? NO_SETTINGS;
  const definition: PluginDefinition = {
    config,
    settings,
    actions: new Map(),
    events: new Map(),
  };
  const plugin: Plugin<M, P, S> = {
    id: config.id,
    // Its own schema, or none (an empty object) when it has no settings, which is then `S`.
    settings: settings as S,
    messages: config.messages,
    defineAction(action) {
      if (definition.actions.has(action.name)) {
        throw new Error(`The action ${action.name} is defined twice`);
      }
      definition.actions.set(action.name, {
        access: action.access,
        input: action.input,
        // Toppo runs it with an input parsed by this very schema, and a context of this plugin.
        handler: (ctx, input) =>
          action.handler(
            ctx as unknown as ActionContext<S, M>,
            input as z.output<typeof action.input>,
          ),
      });
      return { name: action.name, input: action.input };
    },
    defineEventHandler(handler) {
      if (definition.events.has(handler.event)) {
        throw new Error(`The event ${handler.event} has a handler already`);
      }
      // Toppo runs it with a payload checked against this event, and a context of this plugin.
      definition.events.set(handler.event, (ctx, payload) =>
        handler.handler(
          ctx as unknown as Context<S, M>,
          payload as EventPayload<typeof handler.event>,
        ),
      );
      return { event: handler.event };
    },
  };
  register(plugin, definition);
  answerInSandbox(plugin);
  return plugin;
}

/** In Toppo's sandbox, defines `__toppo` for Toppo to ask; elsewhere (tests), does nothing. */
function answerInSandbox(plugin: object): void {
  const host: unknown = Reflect.get(globalThis, HOST_GLOBAL);
  if (isHost(host)) {
    Reflect.set(globalThis, PLUGIN_GLOBAL, servePlugin(plugin, host));
  }
}

function isHost(value: unknown): value is HostGlobal {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'call') === 'function'
  );
}
