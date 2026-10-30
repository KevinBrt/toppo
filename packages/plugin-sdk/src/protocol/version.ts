import { z } from 'zod';

/** The version of the plugin API this SDK and this Toppo speak. */
export const API_VERSION = '1.1';

/** `^1.0`: a major version, and the oldest minor one a plugin needs. */
const RANGE = /^\^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

export const apiVersionSchema = z
  .string()
  .regex(RANGE, 'An API version range is written like ^1.0');

/**
 * Whether a plugin that asks for `range` runs on a Toppo that speaks `host`: the same major
 * version, and a minor one at least as recent. Nothing breaks within a major version.
 */
export function isApiCompatible(range: string, host: string = API_VERSION): boolean {
  const asked = RANGE.exec(range);
  const [hostMajor, hostMinor] = host.split('.').map(Number);
  if (!asked || hostMajor === undefined || hostMinor === undefined) {
    return false;
  }
  return Number(asked[1]) === hostMajor && Number(asked[2]) <= hostMinor;
}

/**
 * Whether a plugin that asks for `range` asks for `version` at least: a Toppo older than that
 * version refuses it by its API, before reading anything it declares.
 */
export function asksAtLeast(range: string, version: string): boolean {
  const asked = RANGE.exec(range);
  const [major, minor] = version.split('.').map(Number);
  if (!asked || major === undefined || minor === undefined) {
    return false;
  }
  const [askedMajor, askedMinor] = [Number(asked[1]), Number(asked[2])];
  return askedMajor > major || (askedMajor === major && askedMinor >= minor);
}
