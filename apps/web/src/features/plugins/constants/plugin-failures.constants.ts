import type { PluginFailure } from '@toppo-tracker/shared';
import type { PlainMessageKey } from '../../../shared/i18n/i18n.types.ts';

/** How a plugin's last run went wrong, in Toppo's words: the same as the email that tells it. */
export const PLUGIN_FAILURE_MESSAGES: Readonly<Record<PluginFailure, PlainMessageKey>> = {
  LOAD_FAILED: 'plugins.failures.loadFailed',
  TIMEOUT: 'plugins.failures.timeout',
  OUT_OF_MEMORY: 'plugins.failures.outOfMemory',
  PLUGIN_ERROR: 'plugins.failures.pluginError',
  INVALID_ANSWER: 'plugins.failures.invalidAnswer',
  CRASHED: 'plugins.failures.crashed',
  ANSWERED_ERROR: 'plugins.failures.answeredError',
};
