import type { FastifyBaseLogger } from 'fastify';
import { openPluginPackage } from '../packages/open-package.ts';
import type { KeptPackage, PackageStore } from '../packages/package-store.ts';
import {
  createPluginSandbox,
  HostCallError,
  type PluginRun,
  type PluginSandbox,
} from '../sandbox/plugin-sandbox.ts';
import type { SandboxOutcome } from '../sandbox/sandbox-protocol.ts';

/** What every plugin gets until it may declare more (docs/plugins/design.md). */
export const PLUGIN_MEMORY_MB = 128;

/** A sandbox nobody ran for this long is stopped: its memory goes back to the server. */
const IDLE_MS = 10 * 60 * 1000;

/** Answers what a plugin asks Toppo during a run: the arguments parsed, the answer JSON. */
export type CallHandler = (method: string, args: unknown) => Promise<unknown>;

const noRunUnderWay: CallHandler = () =>
  Promise.reject(new HostCallError('FORBIDDEN', 'A plugin calls Toppo while it runs only'));

/** The sandboxes of a server process, one per plugin that ran lately. */
export interface PluginRuntime {
  /**
   * Runs `run` in the plugin's sandbox, started from its package (or started again when the
   * package changed), its calls answered by `onCall`. Runs of one plugin follow one another; what
   * its sandbox reports goes to the log of the run that started it.
   */
  run(
    plugin: KeptPackage,
    run: PluginRun,
    onCall: CallHandler,
    log: FastifyBaseLogger,
  ): Promise<SandboxOutcome<unknown>>;
  /** Stops every sandbox, as the server stops. */
  close(): Promise<void>;
}

interface Running {
  sha256: string;
  sandbox: PluginSandbox;
  /** Answers the calls of the run under way. */
  answer: CallHandler;
  idle: NodeJS.Timeout | undefined;
}

export function createPluginRuntime({
  packages,
  workerUrl,
}: {
  packages: Pick<PackageStore, 'read'>;
  /** The sandbox worker's script: `sandbox-worker.ts` from the sources, its bundle once built. */
  workerUrl: URL;
}): PluginRuntime {
  const running = new Map<string, Running>();
  const queues = new Map<string, Promise<unknown>>();

  /** One thing at a time for a plugin: a run, its sandbox started or stopped. */
  function serialized<T>(slug: string, task: () => Promise<T>): Promise<T> {
    const result = (queues.get(slug) ?? Promise.resolve()).then(task);
    queues.set(
      slug,
      result.catch(() => undefined),
    );
    return result;
  }

  async function stop(slug: string, which: Running): Promise<void> {
    if (running.get(slug) !== which) {
      return;
    }
    running.delete(slug);
    clearTimeout(which.idle);
    await which.sandbox.close();
  }

  async function sandboxOf(plugin: KeptPackage, log: FastifyBaseLogger): Promise<Running> {
    const current = running.get(plugin.slug);
    if (current?.sha256 === plugin.sha256) {
      return current;
    }
    if (current) {
      await stop(plugin.slug, current);
    }
    // Read again and checked on each start: a package changed on the disk never runs.
    const { code } = openPluginPackage(await packages.read(plugin));
    const started: Running = {
      sha256: plugin.sha256,
      answer: noRunUnderWay,
      idle: undefined,
      sandbox: createPluginSandbox({
        code,
        memoryMb: PLUGIN_MEMORY_MB,
        workerUrl,
        log: log.child({ plugin: plugin.slug }),
        onCall: (method, args) => started.answer(method, args),
      }),
    };
    running.set(plugin.slug, started);
    return started;
  }

  return {
    run: (plugin, run, onCall, log) =>
      serialized(plugin.slug, async () => {
        const entry = await sandboxOf(plugin, log);
        clearTimeout(entry.idle);
        entry.answer = onCall;
        try {
          return await entry.sandbox.run(run);
        } finally {
          entry.answer = noRunUnderWay;
          entry.idle = setTimeout(
            () => void serialized(plugin.slug, () => stop(plugin.slug, entry)),
            IDLE_MS,
          );
          entry.idle.unref();
        }
      }),

    async close() {
      await Promise.all(
        [...running.entries()].map(([slug, entry]) => serialized(slug, () => stop(slug, entry))),
      );
    },
  };
}
