import {
  FAILURES_BEFORE_DISABLING,
  PLUGIN_FAILURES,
  type PluginFailure,
} from '@toppo-tracker/shared';
import { z } from 'zod';

export { FAILURES_BEFORE_DISABLING, type PluginFailure };

export const pluginFailureSchema = z.enum(PLUGIN_FAILURES);

/** How a failure is kept in `plugins.last_error`: `TIMEOUT in issue.statusChanged`. */
const LAST_ERROR = /^([A-Z_]+) in (.{1,200})$/;

export function lastErrorOf(failure: PluginFailure, during: string): string {
  return `${failure} in ${during}`;
}

/** A failure as `lastErrorOf` kept it, or `null` for anything else. */
export function lastFailureOf(
  lastError: string | null,
): { reason: PluginFailure; during: string } | null {
  const [, reason, during] = LAST_ERROR.exec(lastError ?? '') ?? [];
  const known = pluginFailureSchema.safeParse(reason);
  return known.success && during !== undefined ? { reason: known.data, during } : null;
}
