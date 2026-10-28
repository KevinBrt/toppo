import { z } from 'zod';
import { type Context, createContext } from './context.ts';
import { definitionOf, type PluginDefinition } from './definition.ts';
import { PluginFailure } from './failure.ts';
import { EVENT_TYPES, type EventType, eventPayloadSchema } from './protocol/events.ts';
import type { Manifest, Messages } from './protocol/manifest.ts';
import { type RunAnswer, type RunContext, runContextSchema } from './protocol/run.ts';
import type { HostGlobal, PluginGlobal, RunKind } from './protocol/sandbox.ts';

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
      return checkSettings(definition, payload);
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
    });
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
  actions,
  events,
}: PluginDefinition): Omit<Manifest, 'settings'> & { settings: Record<string, unknown> } {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    ...(config.logo === undefined ? {} : { logo: config.logo }),
    apiVersion: config.apiVersion,
    needs: [...(config.needs ?? [])],
    permissions: config.permissions ?? {},
    settings: jsonSchemaOf(settings),
    messages: config.messages,
    actions: [...actions].map(([name, action]) => ({
      name,
      access: action.access,
      input: jsonSchemaOf(action.input),
    })),
    events: [...events.keys()],
  };
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

/** Whether settings an administrator typed fit the plugin's schema: Toppo saves them if so. */
function checkSettings(definition: PluginDefinition, payload: unknown): RunAnswer {
  const settings = definition.settings.safeParse(payload);
  return settings.success ? { ok: true, result: null } : invalid(settings.error);
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
