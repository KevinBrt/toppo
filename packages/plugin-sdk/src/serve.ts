import { z } from 'zod';
import { type Context, createContext } from './context.ts';
import { definitionOf, type PluginDefinition } from './definition.ts';
import { PluginFailure } from './failure.ts';
import { routeRequestSchema } from './protocol/declarations/routes.ts';
import { EVENT_TYPES, type EventType, eventPayloadSchema } from './protocol/events.ts';
import type { Manifest, Messages } from './protocol/manifest.ts';
import { type RunAnswer, type RunContext, runContextSchema } from './protocol/run.ts';
import type { HostGlobal, PluginGlobal, RunKind } from './protocol/sandbox.ts';
import { routeRequestOf } from './routes/route.ts';

/** The most characters of an error's detail kept for Toppo's log. */
const DETAIL_MAX_LENGTH = 500;

type PluginContext = Context<z.ZodType, Messages>;

/**
 * What a plugin answers Toppo: its manifest, and its runs. In Toppo's sandbox, `definePlugin`
 * serves it as `__toppo` with `__host` for its calls; the testing kit serves it with a fake Toppo.
 */
export function servePlugin(plugin: object, host: HostGlobal): PluginGlobal {
  const definition = definitionOf(plugin);

  async function execute(kind: RunKind, name: string, payload: unknown, context: RunContext) {
    if (kind === 'settings') {
      return checkSettings(definition, name, payload);
    }
    const settings = definition.settings.safeParse(context.settings);
    if (!settings.success) {
      return failure('INVALID_SETTINGS');
    }
    const ctx = createContext({
      host,
      messages: definition.config.messages,
      locale: context.locale,
      settings: settings.data,
      projectSettings: definition.projectSettings,
      entities: definition.entities,
    });
    if (kind === 'job') {
      return await runJob(definition, ctx, name);
    }
    if (kind === 'route') {
      return await runRoute(definition, ctx, name, payload);
    }
    return kind === 'event'
      ? await runEvent(definition, ctx, name, payload)
      : await runAction(definition, ctx, name, payload, context.user);
  }

  return {
    manifest: () => JSON.stringify(manifestOf(definition)),
    async run(kind, name, payload, context) {
      let answer: RunAnswer;
      try {
        answer = await execute(
          kind,
          name,
          JSON.parse(payload),
          runContextSchema.parse(JSON.parse(context)),
        );
      } catch (error) {
        answer = failed(error);
      }
      try {
        return JSON.stringify(answer);
      } catch (error) {
        // What it answered cannot travel as JSON (a BigInt, a cycle): that is its error.
        return JSON.stringify(failed(error));
      }
    },
  };
}

/**
 * What the plugin declares: everything Toppo approves, checks and shows of it. Its settings go as
 * Zod writes them: Toppo's manifest schema says whether it can draw them.
 */
function manifestOf({
  config,
  settings,
  projectSettings,
  entities,
  properties,
  actions,
  events,
  pages,
  panels,
  jobs,
  routes,
}: PluginDefinition): Omit<Manifest, 'settings' | 'projectSettings' | 'entities'> &
  Record<'settings' | 'projectSettings' | 'entities', Record<string, unknown>> {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    ...(config.logo === undefined ? {} : { logo: config.logo }),
    apiVersion: config.apiVersion,
    needs: [...(config.needs ?? [])],
    permissions: config.permissions ?? {},
    settings: jsonSchemaOf(settings),
    projectSettings: jsonSchemaOf(projectSettings),
    entities: Object.fromEntries(
      Object.entries(entities).map(([name, { attachedTo, fields, indexes, limits }]) => [
        name,
        { attachedTo, fields: jsonSchemaOf(fields), indexes: [...indexes], limits },
      ]),
    ),
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, { name: label, type, display, writtenBy }]) => [
        name,
        display === undefined
          ? { name: label, type, writtenBy }
          : { name: label, type, display, writtenBy },
      ]),
    ),
    messages: config.messages,
    actions: [...actions].map(([name, action]) => ({
      name,
      access: action.access,
      input: jsonSchemaOf(action.input),
    })),
    events: [...events.keys()],
    pages: [...pages].map(([name, { zone, access, title, nav }]) => ({
      name,
      zone,
      access,
      title,
      ...(nav === undefined ? {} : { nav }),
    })),
    panels: [...panels].map(([name, { on, access, title }]) => ({ name, on, access, title })),
    jobs: [...jobs].map(([name, { every, label }]) => ({ name, every, label })),
    http: httpOf(config.http),
    routes: [...routes.keys()].map((name) => ({ name })),
  };
}

/** What it may reach, as the manifest writes it. */
function httpOf(http: PluginDefinition['config']['http']): Manifest['http'] {
  if (http === undefined || http === 'any') {
    return http ?? null;
  }
  return 'fromSettings' in http ? { fromSettings: [...http.fromSettings] } : [...http];
}

/** As JSON Schema, for Toppo to check what reaches the plugin and build its forms. */
function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
}

async function runEvent(
  definition: PluginDefinition,
  ctx: PluginContext,
  name: string,
  payload: unknown,
): Promise<RunAnswer> {
  const handle = isEventType(name) ? definition.events.get(name) : undefined;
  if (!(isEventType(name) && handle)) {
    return failure('UNKNOWN_EVENT');
  }
  const event = eventPayloadSchema(name).safeParse(payload);
  if (!event.success) {
    return invalid(event.error);
  }
  await handle(ctx, event.data);
  return { ok: true, result: null };
}

async function runJob(
  definition: PluginDefinition,
  ctx: PluginContext,
  name: string,
): Promise<RunAnswer> {
  const job = definition.jobs.get(name);
  if (!job) {
    return failure('UNKNOWN_JOB');
  }
  await job.handler(ctx);
  return { ok: true, result: null };
}

async function runRoute(
  definition: PluginDefinition,
  ctx: PluginContext,
  name: string,
  payload: unknown,
): Promise<RunAnswer> {
  const route = definition.routes.get(name);
  if (!route) {
    return failure('UNKNOWN_ROUTE');
  }
  const request = routeRequestSchema.safeParse(payload);
  if (!request.success) {
    return invalid(request.error);
  }
  return { ok: true, result: await route.handler(ctx, routeRequestOf(request.data)) };
}

async function runAction(
  definition: PluginDefinition,
  ctx: PluginContext,
  name: string,
  payload: unknown,
  user: RunContext['user'],
): Promise<RunAnswer> {
  const action = definition.actions.get(name);
  if (!action) {
    return failure('UNKNOWN_ACTION');
  }
  if (user === null) {
    throw new Error(`The action ${name} runs for someone`);
  }
  const input = action.input.safeParse(payload);
  if (!input.success) {
    return invalid(input.error);
  }
  const result = await action.handler({ ...ctx, user }, input.data);
  return { ok: true, result: result ?? null };
}

/**
 * Whether settings fit the plugin's schemas, before Toppo saves them: the instance's or a
 * project's, what did not fit field by field; or those saved for each project, by its id, as an
 * upgrade checks them: the ids of the projects whose settings it refuses.
 */
function checkSettings(definition: PluginDefinition, name: string, payload: unknown): RunAnswer {
  switch (name) {
    case 'instance':
    case 'project': {
      const schema = name === 'instance' ? definition.settings : definition.projectSettings;
      const settings = schema.safeParse(payload);
      return settings.success ? { ok: true, result: null } : invalid(settings.error);
    }
    case 'projects': {
      const saved = z.record(z.string(), z.unknown()).safeParse(payload);
      if (!saved.success) {
        return invalid(saved.error);
      }
      const refused = Object.entries(saved.data).flatMap(([projectId, settings]) =>
        definition.projectSettings.safeParse(settings).success ? [] : [projectId],
      );
      return { ok: true, result: refused };
    }
    default:
      return failure('UNKNOWN_SETTINGS');
  }
}

function isEventType(name: string): name is EventType {
  return (EVENT_TYPES as readonly string[]).includes(name);
}

function failure(code: string): RunAnswer {
  return { ok: false, error: { code } };
}

/** What did not fit an input, field by field. */
function invalid(error: z.ZodError): RunAnswer {
  return {
    ok: false,
    error: {
      code: 'VALIDATION_FAILED',
      issues: error.issues.slice(0, 50).map((issue) => ({
        path: issue.path.join('.').slice(0, 200),
        message: issue.message.slice(0, 500),
      })),
    },
  };
}

/** A refusal the plugin meant (`ctx.fail()`), or its error, kept for Toppo's log. */
function failed(error: unknown): RunAnswer {
  if (error instanceof PluginFailure) {
    return {
      ok: false,
      error:
        error.params === undefined
          ? { code: error.code }
          : { code: error.code, params: error.params },
    };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { ok: false, error: { code: 'PLUGIN_ERROR' }, detail: detail.slice(0, DETAIL_MAX_LENGTH) };
}
