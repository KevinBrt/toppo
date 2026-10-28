import { runAnswerSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { DEFAULT_LOCALE } from '@toppo-tracker/shared';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
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

/** Settings saved for the version an upgrade replaces: the instance's, and each project's. */
export interface SavedSettings {
  instance: Record<string, unknown>;
  /** By project id. */
  projects: Record<string, Record<string, unknown>>;
}

/** What an upgrade's code refuses of the settings saved before it. */
export interface RefusedSettings {
  instance: boolean;
  projectIds: string[];
}

/** Asks a server bundle, an upgrade, which settings saved for the version it replaces it refuses. */
export type SettingsChecker = (
  code: string,
  saved: SavedSettings,
  log: FastifyBaseLogger,
) => Promise<RefusedSettings>;

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

/**
 * Asks a bundle, an upgrade, which settings saved for the version it replaces it refuses: in one
 * run for all the projects, whatever their number. A run that fails refuses what it checked.
 */
export function createSettingsChecker(workerUrl: URL): SettingsChecker {
  return (code, saved, log) =>
    inLoneSandbox(code, workerUrl, log, async (sandbox) => {
      const check = async (
        name: 'instance' | 'projects',
        payload: unknown,
      ): Promise<{ taken: true; result: unknown } | { taken: false }> => {
        const outcome = await sandbox.run({
          kind: 'settings',
          name,
          payload,
          context: { locale: DEFAULT_LOCALE, user: null, settings: {} },
          deadlineMs: SETTINGS_CHECK_DEADLINE_MS,
        });
        const answer = runAnswerSchema.safeParse(outcome.ok ? outcome.value : null);
        return answer.success && answer.data.ok
          ? { taken: true, result: answer.data.result }
          : { taken: false };
      };
      const instance =
        Object.keys(saved.instance).length === 0 || (await check('instance', saved.instance)).taken;
      const projectIds = Object.keys(saved.projects);
      if (projectIds.length === 0) {
        return { instance: !instance, projectIds: [] };
      }
      const projects = await check('projects', saved.projects);
      const refused = projects.taken ? z.array(z.string()).safeParse(projects.result).data : null;
      return {
        instance: !instance,
        projectIds: (refused ?? projectIds).filter((id) => projectIds.includes(id)),
      };
    });
}
