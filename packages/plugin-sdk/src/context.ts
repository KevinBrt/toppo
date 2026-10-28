import type { z } from 'zod';
import { PluginFailure } from './failure.ts';
import { type MessageKey, type MessageParams, translate } from './messages.ts';
import { HOST_CALLS, type HostCallMethod, type IssueDetails } from './protocol/calls.ts';
import type { Messages } from './protocol/manifest.ts';
import type { Locale } from './protocol/run.ts';
import type { HostGlobal } from './protocol/sandbox.ts';

/** What every handler is given: the plugin's settings and words, and what it may ask Toppo. */
export interface Context<
  S extends z.ZodType,
  M extends Messages,
  PS extends z.ZodType = z.ZodType,
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
    /** An issue with its words; `null` when it does not exist or is not seen. Needs `issue.read`. */
    get(issueId: string): Promise<IssueDetails | null>;
    /**
     * Comments on an issue, as the plugin's own user. `once` makes it single: an event handled
     * twice comments once. Needs `comment.create`.
     */
    comment(
      issueId: string,
      body: string,
      options?: { once?: string },
    ): Promise<{ commentId: string }>;
  };
  readonly projects: {
    /**
     * What a project it acts in set for itself, parsed with the plugin's schema: its defaults
     * applied. Refused for a project it, or whoever it acts for, does not reach.
     */
    settings(projectId: string): Promise<z.output<PS>>;
  };
}

/** What an action is given besides: who it runs for. */
export interface ActionContext<
  S extends z.ZodType,
  M extends Messages,
  PS extends z.ZodType = z.ZodType,
> extends Context<S, M, PS> {
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
}): Context<S, M, PS> {
  const { host, messages, locale, settings, projectSettings } = options;
  return {
    settings,
    locale,
    t: (key, params) => translate(messages[locale], key, params),
    fail: (code, params) => new PluginFailure(code, params),
    issues: {
      get: (issueId) => callToppo(host, 'issues.get', { issueId }),
      comment: (issueId, body, { once } = {}) =>
        callToppo(
          host,
          'issues.comment',
          once === undefined ? { issueId, body } : { issueId, body, once },
        ),
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
  };
}
