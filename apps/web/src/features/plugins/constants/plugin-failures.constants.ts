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

/** Why a request a plugin sent got no answer, as its page says it. Mirrors HTTP_FAILURES. */
export const HTTP_FAILURE_MESSAGES: ReadonlyMap<string, PlainMessageKey> = new Map([
  ['HOST_NOT_DECLARED', 'plugins.callFailures.hostNotDeclared'],
  ['ADDRESS_NOT_ALLOWED', 'plugins.callFailures.addressNotAllowed'],
  ['TOO_MANY_CALLS', 'plugins.callFailures.tooManyCalls'],
  ['TIMEOUT', 'plugins.callFailures.timeout'],
  ['RESPONSE_TOO_LARGE', 'plugins.callFailures.responseTooLarge'],
  ['TOO_MANY_REDIRECTS', 'plugins.callFailures.tooManyRedirects'],
  ['NETWORK_ERROR', 'plugins.callFailures.networkError'],
]);
