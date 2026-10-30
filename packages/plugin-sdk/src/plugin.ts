import { z } from 'zod';
import type { ActionContext, Context, Entities } from './context.ts';
import { type PluginDefinition, register } from './definition.ts';
import type { MessageKey, MessagesOf } from './messages.ts';
import type { Properties, PropertyNames } from './property.ts';
import type { PluginNeed } from './protocol/calls.ts';
import type { JobEvery } from './protocol/declarations/jobs.ts';
import type { RouteAnswer } from './protocol/declarations/routes.ts';
import type { DialogSize, ScreenIcon } from './protocol/declarations/screens.ts';
import type { EventPayload, EventType } from './protocol/events.ts';
import type { Messages } from './protocol/manifest.ts';
import type { PluginLogo } from './protocol/package.ts';
import { HOST_GLOBAL, type HostGlobal, PLUGIN_GLOBAL } from './protocol/sandbox.ts';
import type { Route, RouteRequest } from './routes/route.ts';
import { provideUrl } from './sandbox/url.ts';
import {
  type Dialog,
  type Page,
  type Panel,
  type ScreenComponent,
  serveScreens,
} from './screens/screens.ts';
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

/** The settings of a plugin that hold a text: those that may hold an address. */
type TextSettingOf<S extends z.ZodType> = {
  [K in keyof z.output<S>]-?: NonNullable<z.output<S>[K]> extends string ? K : never;
}[keyof z.output<S>] &
  string;

/**
 * What a plugin may reach outside Toppo, shown to who approves it: hosts it names, the address
 * typed in some of its settings, or any public site. Never an address inside the network, unless
 * its approval names the host.
 */
export type HttpReach<S extends z.ZodType> =
  | readonly string[]
  | { fromSettings: readonly TextSettingOf<S>[] }
  | 'any';

type NoEntities = Record<never, never>;

const NO_ENTITIES: NoEntities = {};

type NoProperties = Record<never, never>;

const NO_PROPERTIES: NoProperties = {};

export interface PluginConfig<
  M extends Messages,
  P extends PermissionDefinitions<M>,
  S extends z.ZodType,
  PS extends z.ZodType,
  E extends Entities,
  Pr extends Properties,
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
  /** What each project it acts in sets for itself, in the project's settings: the same kinds. */
  projectSettings?: PS;
  /** What it keeps, by name, each declared with `defineEntity`: Toppo stores it. */
  entities?: E;
  /** What it adds to issues, by name, each declared with `defineProperty`: 5 at most. */
  properties?: Pr & PropertyNames<M, Pr>;
  /** What it may reach outside Toppo through `ctx.http`: nothing unless it says so. */
  http?: HttpReach<S>;
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

/** A job of the plugin: what it does on its own, again and again. */
export interface Job {
  readonly name: string;
  readonly every: JobEvery;
}

/**
 * Who may open a screen, which decides who sees its entry: anyone signed in, or those who hold a
 * permission (in the project, for a project's settings or an issue's panel).
 */
export type ScreenAccess<P> = 'authenticated' | { permission: PermissionOf<P> };

/** What every screen declares: its name, who opens it, its title, and what draws it. */
interface ScreenDeclaration<M, P> {
  /** `report`: the last part of its address. */
  name: string;
  access: ScreenAccess<P>;
  title: MessageKey<M>;
  component: ScreenComponent;
}

export interface Plugin<
  M extends Messages,
  P extends PermissionDefinitions<M>,
  S extends z.ZodType,
  PS extends z.ZodType = typeof NO_SETTINGS,
  E extends Entities = NoEntities,
  Pr extends Properties = NoProperties,
> {
  readonly id: string;
  readonly settings: S;
  readonly projectSettings: PS;
  readonly entities: E;
  readonly properties: Pr;
  readonly messages: { readonly en: M; readonly fr: MessagesOf<M> };
  /** What the plugin's screens call: Toppo checks `access`, the SDK the input, then it runs. */
  defineAction<I extends z.ZodType, R>(definition: {
    /** `timeEntry.log`: a resource, a dot, an action. */
    name: string;
    access: Access<P, z.input<I>>;
    input: I;
    handler(ctx: ActionContext<S, M, PS, E, Pr>, input: z.output<I>): Promise<R>;
  }): Action<I, R>;
  /** What the plugin does when something happens to an issue, in the background. */
  defineEventHandler<T extends EventType>(definition: {
    event: T;
    handler(ctx: Context<S, M, PS, E, Pr>, payload: EventPayload<T>): Promise<void>;
  }): EventHandler<T>;
  /**
   * A page of the plugin, in a zone of Toppo's: the main sidebar, the settings, or a project's
   * settings, with an entry in its menu if it says so.
   */
  definePage(
    definition: ScreenDeclaration<M, P> & {
      zone: Page['zone'];
      nav?: { label: MessageKey<M>; icon: ScreenIcon };
    },
  ): Page;
  /** A panel of the plugin beside one of Toppo's screens: an issue's. */
  definePanel(definition: ScreenDeclaration<M, P> & { on: Panel['on'] }): Panel;
  /**
   * A dialog of the plugin, which Toppo opens over the page when one of its screens asks
   * (`useDialog`): in the page's middle, or at its side as a panel. It reads what it was opened
   * with by `input`, 4 KB of JSON at most, and closes with what `result` reads, 16 KB at most.
   */
  defineDialog<I extends z.ZodType, R extends z.ZodType = z.ZodVoid>(
    definition: ScreenDeclaration<M, P> & {
      input: I;
      result?: R;
      /** How wide it opens: `medium` by default. */
      size?: DialogSize;
      /** At the side of the page, as a panel, rather than in its middle. */
      side?: boolean;
    },
  ): Dialog<I, R>;
  /**
   * What the plugin does on its own, as itself, every hour, day or week, counted from its last
   * run: Toppo keeps no time zone to run it at an hour. Its work must bear being done twice: a
   * server stopped mid-way runs it again.
   */
  defineJob(definition: {
    /** `weeklySummary`. */
    name: string;
    every: JobEvery;
    /** What it does, shown to who approves the plugin. */
    label: MessageKey<M>;
    handler(ctx: Context<S, M, PS, E, Pr>): Promise<void>;
  }): Job;
  /**
   * Where a service outside Toppo calls the plugin, a GitHub webhook say:
   * `POST /api/v1/plugins/<id>/routes/<name>`, shown to who approves it. It answers as the plugin
   * itself, within 10 seconds. Anyone may send a request there: check it is the service's
   * (`ctx.crypto.verify`) before trusting it, and answer 401 otherwise.
   */
  defineRoute(definition: {
    /** `push.receive`: the last part of its address. */
    name: string;
    handler(ctx: Context<S, M, PS, E, Pr>, request: RouteRequest): Promise<RouteAnswer>;
  }): Route;
}

/**
 * Declares a plugin: what it is, may do, adds and says. Its actions and event handlers are then
 * defined on it, in any file: `plugin.defineAction({ … })`.
 */
export function definePlugin<
  const M extends Messages,
  const P extends PermissionDefinitions<M> = Record<never, never>,
  S extends z.ZodType = typeof NO_SETTINGS,
  PS extends z.ZodType = typeof NO_SETTINGS,
  E extends Entities = NoEntities,
  Pr extends Properties = NoProperties,
>(config: PluginConfig<M, P, S, PS, E, Pr>): Plugin<M, P, S, PS, E, Pr> {
  const settings = config.settings ?? NO_SETTINGS;
  const projectSettings = config.projectSettings ?? NO_SETTINGS;
  const entities = config.entities ?? NO_ENTITIES;
  const properties = config.properties ?? NO_PROPERTIES;
  const definition: PluginDefinition = {
    config,
    settings,
    projectSettings,
    entities,
    properties,
    actions: new Map(),
    events: new Map(),
    pages: new Map(),
    panels: new Map(),
    dialogs: new Map(),
    jobs: new Map(),
    routes: new Map(),
  };
  const assertNewScreen = (name: string) => {
    if (definition.pages.has(name) || definition.panels.has(name) || definition.dialogs.has(name)) {
      throw new Error(`The screen ${name} is defined twice`);
    }
  };
  const plugin: Plugin<M, P, S, PS, E, Pr> = {
    id: config.id,
    // Its own schemas, or none (an empty object) when it has no settings, which is then `S`.
    settings: settings as S,
    projectSettings: projectSettings as PS,
    // Its entities, or none when it keeps nothing, which is then `E`; its properties likewise.
    entities: entities as E,
    properties: properties as Pr,
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
            ctx as unknown as ActionContext<S, M, PS, E, Pr>,
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
          ctx as unknown as Context<S, M, PS, E, Pr>,
          payload as EventPayload<typeof handler.event>,
        ),
      );
      return { event: handler.event };
    },
    definePage({ name, zone, access, title, nav, component }) {
      assertNewScreen(name);
      definition.pages.set(name, { zone, access, title, nav, component });
      return { name, zone };
    },
    definePanel({ name, on, access, title, component }) {
      assertNewScreen(name);
      definition.panels.set(name, { on, access, title, component });
      return { name, on };
    },
    defineDialog({ name, access, title, component, input, result, size = 'medium', side = false }) {
      assertNewScreen(name);
      definition.dialogs.set(name, { access, title, component, size, side });
      return { name, input, result };
    },
    defineJob({ name, every, label, handler }) {
      if (definition.jobs.has(name)) {
        throw new Error(`The job ${name} is defined twice`);
      }
      // Toppo runs it with a context of this plugin.
      definition.jobs.set(name, {
        every,
        label,
        handler: (ctx) => handler(ctx as unknown as Context<S, M, PS, E, Pr>),
      });
      return { name, every };
    },
    defineRoute({ name, handler }) {
      if (definition.routes.has(name)) {
        throw new Error(`The route ${name} is defined twice`);
      }
      // Toppo runs it with the request as it came, and a context of this plugin.
      definition.routes.set(name, {
        handler: (ctx, request) => handler(ctx as unknown as Context<S, M, PS, E, Pr>, request),
      });
      return { name };
    },
  };
  register(plugin, definition);
  answerInSandbox(plugin);
  serveScreens({
    id: config.id,
    messages: config.messages,
    component: (name) =>
      (definition.pages.get(name) ?? definition.panels.get(name) ?? definition.dialogs.get(name))
        ?.component,
  });
  return plugin;
}

/**
 * In Toppo's sandbox, defines `__toppo` for Toppo to ask, and a `URL` for what reads addresses
 * (`z.url()`), which its JavaScript lacks; elsewhere (tests), does nothing.
 */
function answerInSandbox(plugin: object): void {
  const host: unknown = Reflect.get(globalThis, HOST_GLOBAL);
  if (isHost(host)) {
    provideUrl(globalThis);
    Reflect.set(globalThis, PLUGIN_GLOBAL, servePlugin(plugin, host));
  }
}

function isHost(value: unknown): value is HostGlobal {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'call') === 'function'
  );
}
