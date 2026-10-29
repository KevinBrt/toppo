import type { z } from 'zod';
import { createEntityClient, type Entity, type EntityClient } from './entity.ts';
import { PluginFailure } from './failure.ts';
import { createHttpClient, type HttpClient } from './http/http.ts';
import { type MessageKey, type MessageParams, translate } from './messages.ts';
import type { OwnWritten, Properties, PropertyInput, PropertyValues } from './property.ts';
import { HOST_CALLS, type HostCallMethod, type IssueDetails } from './protocol/calls.ts';
import type { Messages } from './protocol/manifest.ts';
import type { Locale } from './protocol/run.ts';
import type { HostGlobal } from './protocol/sandbox.ts';

/** A plugin's entities, by name: the records it keeps. */
export type Entities = Readonly<Record<string, Entity>>;

/** An issue with its words, and the values of the plugin's own properties it has. */
export type IssueOf<Pr extends Properties> = Omit<IssueDetails, 'properties'> & {
  readonly properties: PropertyValues<Pr>;
};

/** What every handler is given: the plugin's settings and words, and what it may ask Toppo. */
export interface Context<
  S extends z.ZodType,
  M extends Messages,
  PS extends z.ZodType = z.ZodType,
  E extends Entities = Entities,
  Pr extends Properties = Properties,
> {
  /** As the administrator saved them, parsed with the plugin's schema: its defaults applied. */
  readonly settings: z.output<S>;
  /** The language of whoever the plugin acts for; the instance's for an event. */
  readonly locale: Locale;
  /** One of the plugin's messages, in that language. */
  t(key: MessageKey<M>, params?: MessageParams): string;
  /** What to throw to tell the person who acted why: one of the plugin's message keys. */
  fail(code: MessageKey<M>, params?: MessageParams): PluginFailure;
  readonly issues: {
    /**
     * An issue with its words and the plugin's own properties; `null` when it does not exist or
     * is not seen. Needs `issue.read`.
     */
    get(issueId: string): Promise<IssueOf<Pr> | null>;
    /**
     * Comments on an issue, as the plugin's own user. `once` makes it single: an event handled
     * twice comments once. Needs `comment.create`.
     */
    comment(
      issueId: string,
      body: string,
      options?: { once?: string },
    ): Promise<{ commentId: string }>;
    /**
     * Gives an issue it sees a value of a property it writes, checked by Toppo against the
     * property's type; `null` (or `false` for a box) takes it away. No activity is recorded: the
     * value is derived from what the plugin keeps, which is its history.
     */
    setProperty<K extends OwnWritten<Pr>>(
      issueId: string,
      property: K,
      value: PropertyInput<Pr[K]['type']> | null,
    ): Promise<void>;
  };
  readonly projects: {
    /**
     * What a project it acts in set for itself, parsed with the plugin's schema: its defaults
     * applied. Refused for a project it, or whoever it acts for, does not reach.
     */
    settings(projectId: string): Promise<z.output<PS>>;
  };
  /** Its records, entity by entity, as far as it, and whoever it acts for, sees them. */
  readonly entities: { readonly [K in keyof E]: EntityClient<E[K]> };
  /** Requests outside Toppo, where it declared it may go (`http` in `definePlugin`). */
  readonly http: HttpClient;
}

/** What an action is given besides: who it runs for. */
export interface ActionContext<
  S extends z.ZodType,
  M extends Messages,
  PS extends z.ZodType = z.ZodType,
  E extends Entities = Entities,
  Pr extends Properties = Properties,
> extends Context<S, M, PS, E, Pr> {
  readonly user: { readonly id: string };
}

/** Sends a call to Toppo, checked on the way out and on the way back. */
async function callToppo<T extends HostCallMethod>(
  host: HostGlobal,
  method: T,
  args: z.input<(typeof HOST_CALLS)[T]['args']>,
): Promise<z.output<(typeof HOST_CALLS)[T]['result']>> {
  const { args: argsSchema, result } = HOST_CALLS[method];
  const answer = await host.call(method, JSON.stringify(argsSchema.parse(args)));
  return result.parse(JSON.parse(answer)) as z.output<(typeof HOST_CALLS)[T]['result']>;
}

export function createContext<
  S extends z.ZodType,
  M extends Messages,
  PS extends z.ZodType,
>(options: {
  host: HostGlobal;
  messages: { readonly en: Messages; readonly fr: Messages };
  locale: Locale;
  settings: z.output<S>;
  /** The plugin's schema of a project's settings, which parses what Toppo answers. */
  projectSettings: PS;
  entities: Entities;
}): Context<S, M, PS> {
  const { host, messages, locale, settings, projectSettings } = options;
  const call = <T extends HostCallMethod>(
    method: T,
    args: z.input<(typeof HOST_CALLS)[T]['args']>,
  ) => callToppo(host, method, args);
  return {
    settings,
    locale,
    t: (key, params) => translate(messages[locale], key, params),
    fail: (code, params) => new PluginFailure(code, params),
    issues: {
      // Toppo answers the plugin's own properties: they are what it declares.
      get: async (issueId) =>
        (await callToppo(host, 'issues.get', { issueId })) as IssueOf<Properties> | null,
      comment: (issueId, body, { once } = {}) =>
        callToppo(
          host,
          'issues.comment',
          once === undefined ? { issueId, body } : { issueId, body, once },
        ),
      async setProperty(issueId, property, value) {
        await callToppo(host, 'issues.setProperty', { issueId, property, value });
      },
    },
    projects: {
      async settings(projectId) {
        const saved = projectSettings.safeParse(
          await callToppo(host, 'projects.settings', { projectId }),
        );
        if (!saved.success) {
          throw new Error(`The settings of project ${projectId} do not fit this version`);
        }
        return saved.data;
      },
    },
    entities: Object.fromEntries(
      Object.entries(options.entities).map(([name, entity]) => [
        name,
        createEntityClient(call, name, entity),
      ]),
    ),
    http: createHttpClient((request) => callToppo(host, 'http.fetch', request)),
  };
}
