import { type Action, type EventType, type Job, z } from '@toppo-tracker/plugin-sdk';
import { servePlugin } from '@toppo-tracker/plugin-sdk/host';
import {
  type DeletedIssue,
  type EventPayload,
  HOST_CALLS,
  type HostCallMethod,
  type HostGlobal,
  type HttpAnswer,
  type HttpFailureCode,
  type IssueDetails,
  type IssueSnapshot,
  isApiCompatible,
  type Locale,
  type Manifest,
  manifestSchema,
  type RunAnswer,
  runAnswerSchema,
} from '@toppo-tracker/plugin-sdk/protocol';
import { createTestProperties } from './test-properties.ts';
import { createTestRecords } from './test-records.ts';

/** Why a run was refused: the plugin's own code (a message key), or one of Toppo's. */
export class PluginRunError extends Error {
  readonly code: string;
  readonly params: Readonly<Record<string, string | number>> | undefined;
  /** What did not fit the input, field by field. */
  readonly issues: readonly { path: string; message: string }[] | undefined;
  /** The plugin's error, as Toppo would log it. */
  readonly detail: string | undefined;

  constructor(answer: Extract<RunAnswer, { ok: false }>) {
    super(answer.detail ? `${answer.error.code}: ${answer.detail}` : answer.error.code);
    this.name = 'PluginRunError';
    this.code = answer.error.code;
    this.params = answer.error.params;
    this.issues = answer.error.issues;
    this.detail = answer.detail;
  }
}

/** A comment the plugin wrote, as its own user. */
export interface TestComment {
  id: string;
  issueId: string;
  body: string;
}

export interface TestUser {
  readonly id: string;
  /** Runs an action for this user, as Toppo would: access checked, then the plugin. */
  run<I extends z.ZodType, R>(action: Action<I, R>, input: z.input<I>): Promise<R>;
}

/** A request the plugin sent outside Toppo, as Toppo checked it. */
export interface TestHttpRequest {
  url: string;
  method: string;
  headers: Readonly<Record<string, string>>;
  body: string | null;
}

/** What the test's outside world answers: a response, or why there was none. */
export type TestHttpReply = Partial<HttpAnswer> | HttpFailureCode;

/** An issue to start from: anything left out takes a plausible value. */
export type TestIssueInput = Partial<Omit<IssueDetails, 'id' | 'key'>>;

/**
 * A fake Toppo for a plugin's tests, in memory, with Toppo's rules: the plugin may only make the
 * calls its `needs` allow; an action runs only for someone its `access` lets in (404 for an issue
 * they do not see); a comment with the same `once` is written once; a project's settings are read
 * in a project the plugin reaches, and whoever it acts for too; a property is written by the
 * plugin when it says so, checked against its type. The plugin runs in the test's
 * process, its answers through JSON as in the sandbox; `toppo plugin build` checks its bundle.
 */
export function createTestToppo(
  plugin: object,
  options: {
    settings?: unknown;
    /** What projects set for themselves, by project id: the projects the plugin acts in. */
    projectSettings?: Readonly<Record<string, unknown>>;
    locale?: Locale;
    /**
     * The world outside Toppo, as the plugin's requests reach it: where its manifest says it may
     * go, by name (Toppo's own checks of addresses run in Toppo). Nothing answers by default.
     */
    http?: (request: TestHttpRequest) => TestHttpReply | Promise<TestHttpReply>;
  } = {},
) {
  let lastId = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++lastId).padStart(12, '0')}`;
  const issues = new Map<string, IssueDetails>();
  const comments: TestComment[] = [];
  const written = new Map<string, string>();
  const sent: TestHttpRequest[] = [];
  /** Who the run under way is for: `null` for an event, which the plugin handles as itself. */
  let runningFor: { id: string; sees: (issueId: string | undefined) => boolean } | null = null;
  const locale = options.locale ?? 'en';

  const host: HostGlobal = {
    call: async (method, args) => JSON.stringify(await answer(method, JSON.parse(args))),
  };
  const served = servePlugin(plugin, host);
  const declared = manifestSchema.safeParse(JSON.parse(served.manifest()));
  if (!declared.success) {
    throw new Error(`Toppo would refuse its manifest:\n${z.prettifyError(declared.error)}`);
  }
  const manifest: Manifest = declared.data;
  if (!isApiCompatible(manifest.apiVersion)) {
    throw new Error(`The plugin asks for API ${manifest.apiVersion}, which this Toppo lacks`);
  }
  const records = createTestRecords(manifest, issues, nextId);

  function visible(issueId: string): IssueDetails | undefined {
    const issue = issues.get(issueId);
    return issue && (runningFor === null || runningFor.sees(issueId)) ? issue : undefined;
  }

  const properties = createTestProperties(manifest, issues, visible);

  /** Toppo's answer to a call, within the needs the plugin declared. */
  function answer(method: string, args: unknown): Promise<unknown> {
    const call = Object.hasOwn(HOST_CALLS, method)
      ? HOST_CALLS[method as HostCallMethod]
      : undefined;
    if (!(call && (call.needs === null || manifest.needs.includes(call.needs)))) {
      return Promise.reject(new Error(call ? 'FORBIDDEN' : 'UNKNOWN_METHOD'));
    }
    if (method.startsWith('entities.')) {
      const reader = runningFor && { id: runningFor.id, sees: runningFor.sees };
      return Promise.resolve().then(() => records.answer(method, args, reader));
    }
    switch (method) {
      case 'issues.get':
        return getIssue(args);
      case 'projects.settings':
        return projectSettings(args);
      case 'issues.setProperty':
        return Promise.resolve().then(() => properties.set(args));
      case 'http.fetch':
        return fetchOutside(args);
      default:
        return comment(args);
    }
  }

  /** Whether the manifest lets the plugin reach this host: named, in its settings, or any. */
  function declares(url: URL): boolean {
    const { http } = manifest;
    if (http === null || http === 'any') {
      return http === 'any';
    }
    const hosts = Array.isArray(http)
      ? http
      : http.fromSettings.flatMap((name) => {
          const value: unknown =
            typeof options.settings === 'object' && options.settings !== null
              ? Reflect.get(options.settings, name)
              : undefined;
          return typeof value === 'string' && URL.canParse(value) ? [new URL(value).hostname] : [];
        });
    return hosts.includes(url.hostname);
  }

  /** A request outside Toppo, where the plugin declared it may go, answered by the test. */
  async function fetchOutside(args: unknown): Promise<HttpAnswer> {
    const request = HOST_CALLS['http.fetch'].args.parse(args);
    const url = URL.canParse(request.url) ? new URL(request.url) : undefined;
    if (!(url && ['http:', 'https:'].includes(url.protocol))) {
      throw new Error('ADDRESS_NOT_ALLOWED');
    }
    if (!declares(url)) {
      throw new Error('HOST_NOT_DECLARED');
    }
    sent.push(request);
    const reply = options.http ? await options.http(request) : 'NETWORK_ERROR';
    if (typeof reply === 'string') {
      throw new Error(reply);
    }
    return { status: 200, headers: {}, body: '', ...reply };
  }

  /**
   * What a project set for itself: in a project the plugin acts in, which whoever it acts for
   * reaches by an issue they see.
   */
  function projectSettings(args: unknown): Promise<unknown> {
    const { projectId } = HOST_CALLS['projects.settings'].args.parse(args);
    const settings = options.projectSettings ?? {};
    const reached =
      Object.hasOwn(settings, projectId) &&
      (runningFor === null ||
        [...issues.values()].some(
          (issue) => issue.projectId === projectId && runningFor?.sees(issue.id),
        ));
    return reached ? Promise.resolve(settings[projectId]) : Promise.reject(new Error('NOT_FOUND'));
  }

  function getIssue(args: unknown): Promise<IssueDetails | null> {
    const { issueId } = HOST_CALLS['issues.get'].args.parse(args);
    return Promise.resolve(visible(issueId) ?? null);
  }

  /** A comment, once per `once` key: an event handled twice comments once. */
  function comment(args: unknown): Promise<{ commentId: string }> {
    const { issueId, body, once } = HOST_CALLS['issues.comment'].args.parse(args);
    if (!visible(issueId)) {
      return Promise.reject(new Error('NOT_FOUND'));
    }
    const key = once === undefined ? undefined : `${issueId}:${once}`;
    const previous = key === undefined ? undefined : written.get(key);
    return Promise.resolve({ commentId: previous ?? addComment(issueId, body, key) });
  }

  function addComment(issueId: string, body: string, key: string | undefined): string {
    const added = { id: nextId(), issueId, body };
    comments.push(added);
    if (key !== undefined) {
      written.set(key, added.id);
    }
    return added.id;
  }

  async function run(
    kind: 'action' | 'event' | 'job',
    name: string,
    payload: unknown,
    user: { id: string } | null,
  ): Promise<unknown> {
    const reply = runAnswerSchema.parse(
      JSON.parse(
        await served.run(
          kind,
          name,
          JSON.stringify(payload),
          JSON.stringify({ locale, user, settings: options.settings ?? {} }),
        ),
      ),
    );
    if (!reply.ok) {
      throw new PluginRunError(reply);
    }
    return reply.result;
  }

  /** What Toppo checks before an action runs: the access its manifest declares. */
  function refusal(
    name: string,
    input: unknown,
    user: { sees(id: string | undefined): boolean; holds(permission: string): boolean },
  ) {
    const access = manifest.actions.find((action) => action.name === name)?.access;
    if (access === undefined || access === 'authenticated') {
      return undefined;
    }
    if ('issue' in access && !user.sees(issueNamed(input, access.issue))) {
      return 'NOT_FOUND';
    }
    return access.permission === undefined || user.holds(access.permission)
      ? undefined
      : 'FORBIDDEN';
  }

  /** The issue an action's input names, when it is one there is. */
  function issueNamed(input: unknown, field: string): string | undefined {
    const issueId =
      typeof input === 'object' && input !== null ? Reflect.get(input, field) : undefined;
    return typeof issueId === 'string' && issues.has(issueId) ? issueId : undefined;
  }

  return {
    manifest,
    /** What the plugin commented, in order. */
    comments: comments as readonly TestComment[],
    /** The requests the plugin sent outside Toppo, in order. */
    requests: sent as readonly TestHttpRequest[],
    /** What the plugin kept of one of its entities, oldest first, whoever sees it. */
    records: (entity: string) => records.of(entity),
    /** The values of the plugin's properties an issue has, by their names. */
    properties: (issueId: string): IssueDetails['properties'] =>
      issues.get(issueId)?.properties ?? {},

    createIssue(input: TestIssueInput = {}): IssueDetails {
      const id = nextId();
      const number = issues.size + 1;
      const now = '2026-01-01T09:00:00.000Z';
      const issue: IssueDetails = {
        id,
        key: `${input.projectKey ?? 'WEB'}-${number}`,
        projectId: '00000000-0000-4000-8000-000000000100',
        projectKey: 'WEB',
        title: `Issue ${number}`,
        description: '',
        status: { id: '00000000-0000-4000-8000-000000000201', name: 'Open', closes: false },
        category: { id: '00000000-0000-4000-8000-000000000301', name: 'Bug' },
        priority: { id: '00000000-0000-4000-8000-000000000401', name: 'Normal', level: 2 },
        assigneeId: null,
        reporterId: '00000000-0000-4000-8000-000000000001',
        closedAt: null,
        createdAt: now,
        updatedAt: now,
        properties: {},
        ...input,
      };
      issues.set(id, issue);
      return issue;
    },

    /** Someone who sees the issues given (all by default) and holds the permissions given. */
    createUser(
      user: { sees?: readonly IssueSnapshot[]; permissions?: readonly string[] } = {},
    ): TestUser {
      const id = nextId();
      const seen = user.sees && new Set(user.sees.map((issue) => issue.id));
      const sees = (issueId: string | undefined) =>
        issueId !== undefined && (seen === undefined || seen.has(issueId));
      const holds = (permission: string) => user.permissions?.includes(permission) ?? false;
      return {
        id,
        async run<I extends z.ZodType, R>(action: Action<I, R>, input: z.input<I>): Promise<R> {
          const refused = refusal(action.name, input, { sees, holds });
          if (refused) {
            throw new PluginRunError({ ok: false, error: { code: refused } });
          }
          runningFor = { id, sees };
          try {
            return (await run('action', action.name, input, { id })) as R;
          } finally {
            runningFor = null;
          }
        },
      };
    },

    /** Tells the plugin that something happened to an issue, as Toppo's job would. */
    async emit<T extends EventType>(
      type: T,
      happened: {
        issue: T extends 'issue.deleted' ? DeletedIssue : IssueSnapshot;
        change: EventPayload<T>['change'];
        actorId?: string;
      },
    ): Promise<void> {
      const { description: _description, ...issue } = happened.issue as IssueSnapshot & {
        description?: string;
      };
      const event = {
        id: nextId(),
        type,
        occurredAt: new Date().toISOString(),
        actorId: happened.actorId ?? '00000000-0000-4000-8000-000000000001',
      };
      await run('event', type, { event, issue, change: happened.change }, null);
    },

    /** Runs one of the plugin's jobs, as Toppo does when its time comes: as the plugin itself. */
    async runJob(job: Job): Promise<void> {
      await run('job', job.name, null, null);
    },
  };
}

export type TestToppo = ReturnType<typeof createTestToppo>;
