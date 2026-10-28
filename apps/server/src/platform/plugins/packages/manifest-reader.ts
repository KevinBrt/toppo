import { DEFAULT_LOCALE } from '@toppo-tracker/shared';
import type { FastifyBaseLogger } from 'fastify';
import { PLUGIN_MEMORY_MB } from '../runtime/plugin-runtime.ts';
import {
  createPluginSandbox,
  HostCallError,
  type PluginSandbox,
} from '../sandbox/plugin-sandbox.ts';
import type { SandboxOutcome } from '../sandbox/sandbox-protocol.ts';

/** What a check of settings may take: an administrator waits for it. */
export const SETTINGS_CHECK_DEADLINE_MS = 5000;

/**
 * Runs a server bundle to ask what it declares; the answer is checked by the caller. What the
 * sandbox logs goes to `log`.
 */
export type ManifestReader = (
  code: string,
  log: FastifyBaseLogger,
) => Promise<SandboxOutcome<unknown>>;

/**
 * Asks a server bundle whether it takes settings saved for another version of it: its answer, a
 * run's, is read by the caller.
 */
export type SettingsChecker = (
  code: string,
  settings: Record<string, unknown>,
  log: FastifyBaseLogger,
) => Promise<SandboxOutcome<unknown>>;

/**
 * Runs `use` in a sandbox of the bundle's own, stopped right after: a package is read before anyone
 * approved it, so nothing of Toppo is open to it.
 */
async function inLoneSandbox<T>(
  code: string,
  workerUrl: URL,
  log: FastifyBaseLogger,
  use: (sandbox: PluginSandbox) => Promise<T>,
): Promise<T> {
  const sandbox = createPluginSandbox({
    code,
    memoryMb: PLUGIN_MEMORY_MB,
    workerUrl,
    log,
    onCall: () =>
      Promise.reject(new HostCallError('FORBIDDEN', 'A plugin calls Toppo once it is enabled')),
  });
  try {
    return await use(sandbox);
  } finally {
    await sandbox.close();
  }
}

/** Asks a bundle what it declares: its manifest is all it says. */
export function createManifestReader(
  /** The sandbox worker's script: `sandbox-worker.ts` from the sources, its bundle once built. */
  workerUrl: URL,
): ManifestReader {
  return (code, log) => inLoneSandbox(code, workerUrl, log, (sandbox) => sandbox.manifest());
}

/** Asks a bundle, an upgrade, whether it takes the settings saved for the version it replaces. */
export function createSettingsChecker(workerUrl: URL): SettingsChecker {
  return (code, settings, log) =>
    inLoneSandbox(code, workerUrl, log, (sandbox) =>
      sandbox.run({
        kind: 'settings',
        name: 'settings',
        payload: settings,
        context: { locale: DEFAULT_LOCALE, user: null, settings: {} },
        deadlineMs: SETTINGS_CHECK_DEADLINE_MS,
      }),
    );
}
