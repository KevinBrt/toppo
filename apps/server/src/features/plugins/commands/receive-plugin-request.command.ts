import {
  ROUTE_LIMITS,
  type RouteAnswer,
  routeAnswerSchema,
  routeRequestSchema,
  runAnswerSchema,
} from '@toppo-tracker/plugin-sdk/protocol';
import { DEFAULT_LOCALE, pluginRouteParamsSchema } from '@toppo-tracker/shared';
import { defineDetachedCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { countOnce } from '../../../platform/http/rate-limit.ts';
import { answerCalls } from '../../../platform/plugins/host-calls.ts';
import type { SandboxOutcome } from '../../../platform/plugins/sandbox/sandbox-protocol.ts';
import { actingPlugin } from '../utils/plugin-actor.util.ts';
import { failureOf } from '../utils/plugin-failures.util.ts';

const notFound = () =>
  new HttpError(404, 'PLUGIN_ROUTE_NOT_FOUND', 'No enabled plugin receives requests here');

const failed = () =>
  new HttpError(502, 'PLUGIN_FAILED', 'The plugin failed to answer this request');

/**
 * Hands a request from outside Toppo to a plugin's route, a service's webhook say, which answers
 * it as the plugin itself, with its approved needs in its projects. Anyone may send one: the
 * plugin checks it is the service's (`ctx.crypto.verify`). Toppo bounds the rest: a plugin enabled
 * that declares the route, a few hundred requests a minute whoever sends them, ten seconds to
 * answer. A route that fails counts no failure toward disabling the plugin, since anyone may send
 * it what makes it fail; the caller is answered 502, and the log says why.
 */
export const receivePluginRequest = defineDetachedCommand({
  name: 'plugin.receiveRequest',
  access: 'public',
  input: pluginRouteParamsSchema.extend({ request: routeRequestSchema }),
  async handler({ db, log, services }, { pluginSlug, route, request }): Promise<RouteAnswer> {
    const plugin = await actingPlugin(db, { slug: pluginSlug }, services.secrets);
    if (!plugin?.manifest.routes.some(({ name }) => name === route)) {
      throw notFound();
    }
    const counted = await countOnce(db, `plugin-routes:${plugin.slug}`, 60);
    if (counted.count > ROUTE_LIMITS.perPluginPerMinute) {
      throw new HttpError(429, 'TOO_MANY_REQUESTS', 'Too many requests, try again later');
    }
    const context = { db, actor: plugin.actor, log, services };
    let outcome: SandboxOutcome<unknown>;
    try {
      outcome = await services.plugins.runtime.run(
        { slug: plugin.slug, sha256: plugin.sha256 },
        {
          kind: 'route',
          name: route,
          payload: request,
          context: { locale: DEFAULT_LOCALE, user: null, settings: plugin.settings },
          deadlineMs: ROUTE_LIMITS.deadlineMs,
        },
        answerCalls(services.plugins.calls, context, plugin.needs),
        log,
      );
    } catch (error) {
      log.error({ err: error, plugin: plugin.slug }, 'The plugin could not be run');
      outcome = { ok: false, failure: 'CRASHED' };
    }
    const answer = runAnswerSchema.safeParse(outcome.ok ? outcome.value : null);
    if (answer.success && !answer.data.ok) {
      const { code, params } = answer.data.error;
      throw new HttpError(422, 'PLUGIN_REFUSED', 'The plugin refused', {
        plugin: { code, ...(params ? { params } : {}) },
      });
    }
    const failure = failureOf(outcome);
    const replied = answer.success && answer.data.ok ? answer.data.result : undefined;
    const reply = routeAnswerSchema.safeParse(replied);
    if (failure || !reply.success) {
      // Its kind only: what the plugin answered may repeat its secrets, or what a caller sent.
      log.warn(
        { plugin: plugin.slug, route, failure: failure ?? 'INVALID_ANSWER' },
        'Plugin failed',
      );
      throw failed();
    }
    if (JSON.stringify(reply.data.body ?? null).length > ROUTE_LIMITS.answerBytes) {
      log.warn({ plugin: plugin.slug, route }, 'Plugin answered too much');
      throw failed();
    }
    return reply.data;
  },
});
