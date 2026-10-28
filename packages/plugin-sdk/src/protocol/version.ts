import { z } from 'zod';

/** The version of the plugin API this SDK and this Toppo speak. */
export const API_VERSION = '1.0';

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
