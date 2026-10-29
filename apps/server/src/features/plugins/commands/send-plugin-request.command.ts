import { type Db, schema } from '@toppo-tracker/db';
import {
  HOST_CALLS,
  HTTP_LIMITS,
  type HttpAnswer,
  type Manifest,
} from '@toppo-tracker/plugin-sdk/protocol';
import { PLUGIN_HTTP_CALLS_KEPT } from '@toppo-tracker/shared';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { defineDetachedCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import {
  OUTBOUND_LIMITS,
  OutboundError,
  type OutboundPolicy,
  outboundFetch,
} from '../../../platform/http/outbound/outbound-fetch.ts';
import { countOnce } from '../../../platform/http/rate-limit.ts';
import { type ActingPlugin, actingPlugin } from '../utils/plugin-actor.util.ts';

const { pluginHttpCalls } = schema;

const PLUGIN_LIMITS = {
  ...OUTBOUND_LIMITS,
  deadlineMs: HTTP_LIMITS.deadlineMs,
  maxResponseBytes: HTTP_LIMITS.responseBytes,
};

/**
 * Sends a plugin's request outside Toppo (`ctx.http.fetch`): where its manifest says it may go,
 * to a public address unless its approval names the host, 60 a minute. It holds no transaction
 * while it waits. Each call is kept for its page, by its host only; the 50 last. Answers what
 * the server answered; a request that got no answer is refused with why (`TIMEOUT`…).
 */
export const sendPluginRequest = defineDetachedCommand({
  name: 'plugin.sendRequest',
  access: 'authenticated',
  input: HOST_CALLS['http.fetch'].args,
  async handler({ db, actor, services }, request): Promise<HttpAnswer> {
    if (!actor.plugin) {
      throw new HttpError(403, 'FORBIDDEN', 'A plugin sends its own requests');
    }
    const plugin = await actingPlugin(db, { slug: actor.plugin.slug }, services.secrets);
    if (!plugin) {
      throw new HttpError(404, 'PLUGIN_NOT_FOUND', 'The plugin is not enabled');
    }
    const started = performance.now();
    const call = { pluginId: plugin.id, method: request.method, host: hostOf(request.url) };
    const { count } = await countOnce(db, `plugin-http:${plugin.slug}`, 60);
    if (count > HTTP_LIMITS.callsPerMinute) {
      await keep(db, { ...call, status: null, error: 'TOO_MANY_CALLS', started });
      throw new HttpError(429, 'TOO_MANY_CALLS', `At most ${HTTP_LIMITS.callsPerMinute} a minute`);
    }
    try {
      const answer = await outboundFetch(request, policyOf(plugin), PLUGIN_LIMITS);
      await keep(db, { ...call, status: answer.status, error: null, started });
      return answer;
    } catch (error) {
      if (!(error instanceof OutboundError)) {
        throw error;
      }
      await keep(db, { ...call, status: null, error: error.code, started });
      throw new HttpError(422, error.code, error.message);
    }
  },
});

/** Where the plugin may go: as its manifest says, and inside the network as its approval names. */
function policyOf({ manifest, settings, privateHosts }: ActingPlugin): OutboundPolicy {
  const hosts = declaredHosts(manifest.http, settings);
  return {
    mayReach: (url) => hosts === 'any' || hosts.includes(url.hostname),
    privateHosts,
  };
}

/** The hosts a plugin declared, or those of the addresses in the settings it names. */
function declaredHosts(
  http: Manifest['http'],
  settings: Readonly<Record<string, unknown>>,
): readonly string[] | 'any' {
  if (http === null || http === 'any') {
    return http ?? [];
  }
  if (Array.isArray(http)) {
    return http;
  }
  return http.fromSettings.flatMap((name) => {
    const address = settings[name];
    return typeof address === 'string' && URL.canParse(address) ? [new URL(address).hostname] : [];
  });
}

/** The host a request was for, as its page shows it: never its path, query or credentials. */
function hostOf(url: string): string {
  return (URL.canParse(url) ? new URL(url).host : '').slice(0, 260) || '-';
}

/** Keeps a call for the plugin's page, and only its last ones. */
async function keep(
  db: Db,
  call: {
    pluginId: string;
    method: string;
    host: string;
    status: number | null;
    error: string | null;
    started: number;
  },
): Promise<void> {
  const { started, ...kept } = call;
  await db
    .insert(pluginHttpCalls)
    .values({ ...kept, durationMs: Math.round(performance.now() - started) });
  const latest = db
    .select({ id: pluginHttpCalls.id })
    .from(pluginHttpCalls)
    .where(eq(pluginHttpCalls.pluginId, call.pluginId))
    .orderBy(desc(pluginHttpCalls.createdAt), desc(pluginHttpCalls.id))
    .limit(PLUGIN_HTTP_CALLS_KEPT);
  await db
    .delete(pluginHttpCalls)
    .where(
      and(eq(pluginHttpCalls.pluginId, call.pluginId), notInArray(pluginHttpCalls.id, latest)),
    );
}
