import type { FastifyBaseLogger } from 'fastify';
import { createPluginSandbox, HostCallError } from '../sandbox/plugin-sandbox.ts';
import type { SandboxOutcome } from '../sandbox/sandbox-protocol.ts';

/** What every plugin gets until it may declare more (docs/plugins/design.md). */
const MEMORY_MB = 128;

/**
 * Runs a server bundle to ask what it declares; the answer is checked by the caller. What the
 * sandbox logs goes to `log`.
 */
export type ManifestReader = (
  code: string,
  log: FastifyBaseLogger,
) => Promise<SandboxOutcome<unknown>>;

/**
 * Asks a bundle what it declares, in a sandbox of its own, stopped right after: a package is read
 * before anyone approved it, so nothing of Toppo is open to it, and its manifest is all it says.
 */
export function createManifestReader(
  /** The sandbox worker's script: `sandbox-worker.ts` from the sources, its bundle once built. */
  workerUrl: URL,
): ManifestReader {
  return async (code, log) => {
    const sandbox = createPluginSandbox({
      code,
      memoryMb: MEMORY_MB,
      workerUrl,
      log,
      onCall: () =>
        Promise.reject(new HostCallError('FORBIDDEN', 'A plugin calls Toppo once it is enabled')),
    });
    try {
      return await sandbox.manifest();
    } finally {
      await sandbox.close();
    }
  };
}
