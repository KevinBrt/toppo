import type { RouteRequestData } from '../protocol/declarations/routes.ts';

/** A route of the plugin: where a service outside Toppo calls it. */
export interface Route {
  readonly name: string;
}

/**
 * A request one of its routes received, as it came: its body unparsed, since a signature is of
 * these very characters. Anyone may send one: check it is the service's before trusting it.
 */
export interface RouteRequest extends Readonly<RouteRequestData> {
  /** The body read as JSON; throws when it is not. */
  json(): unknown;
}

export function routeRequestOf(data: RouteRequestData): RouteRequest {
  return { ...data, json: () => JSON.parse(data.body) as unknown };
}
