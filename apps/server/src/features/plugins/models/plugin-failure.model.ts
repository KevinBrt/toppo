import { z } from 'zod';

/**
 * How a plugin's run went wrong, as Toppo tells it: the sandbox's own failures, and a handler
 * that answered an error. Never in the plugin's words, which stay in the server's log.
 */
export const PLUGIN_FAILURES = [
  'LOAD_FAILED',
  'TIMEOUT',
  'OUT_OF_MEMORY',
  'PLUGIN_ERROR',
  'INVALID_ANSWER',
  'CRASHED',
  'ANSWERED_ERROR',
] as const;

export type PluginFailure = (typeof PLUGIN_FAILURES)[number];

export const pluginFailureSchema = z.enum(PLUGIN_FAILURES);

/** Runs that fail in a row before Toppo disables their plugin. */
export const FAILURES_BEFORE_DISABLING = 10;
