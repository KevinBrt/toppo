import { ROUTE_LIMITS, type RouteRequestData } from '@toppo-tracker/plugin-sdk/protocol';
import type { FastifyRequest } from 'fastify';

/**
 * Headers a plugin's route never sees: the caller's Toppo session, were a browser to send one,
 * and what only carries the connection.
 */
const WITHHELD_HEADERS = new Set([
  'cookie',
  'connection',
  'keep-alive',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Each field as one text, several values joined as HTTP joins them; at most as many as allowed. */
function fieldsOf(
  fields: Readonly<Record<string, unknown>>,
  kept: (name: string) => boolean,
): Record<string, string> {
  const texts = Object.entries(fields).flatMap(([name, value]): [string, string][] => {
    const text = Array.isArray(value) ? value.map(String).join(', ') : value;
    return kept(name) && typeof text === 'string' ? [[name, text]] : [];
  });
  // Past the limit, the request is refused by the route's schema rather than cut silently.
  return Object.fromEntries(texts.slice(0, ROUTE_LIMITS.fields + 1));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/** A request as a plugin's route is given it: its body as it came, never a cookie. */
export function routeRequestOf(request: FastifyRequest): RouteRequestData {
  return {
    method: 'POST',
    headers: fieldsOf(request.headers, (name) => !WITHHELD_HEADERS.has(name)),
    query: fieldsOf(isRecord(request.query) ? request.query : {}, () => true),
    body: typeof request.body === 'string' ? request.body : '',
  };
}
