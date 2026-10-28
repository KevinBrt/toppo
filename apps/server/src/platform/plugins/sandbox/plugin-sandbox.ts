import { Worker } from 'node:worker_threads';
import type { FastifyBaseLogger } from 'fastify';
import { LOAD_DEADLINE_MS, MANIFEST_DEADLINE_MS } from './quickjs-sandbox.ts';
import {
  type FromWorker,
  MESSAGE_MAX_LENGTH,
  type RunKind,
  type SandboxFailure,
  type SandboxOutcome,
  type ToWorker,
  type WorkerData,
} from './sandbox-protocol.ts';

/** Past a deadline, the time Toppo leaves the worker: QuickJS stops the plugin first. */
const GRACE_MS = 1000;
/** A new worker compiles QuickJS before it loads the plugin. */
const START_MS = 2000;
/** The worker's own heap, beside the plugin's WebAssembly memory: messages and their JSON. */
const WORKER_HEAP_MB = 64;
/** Failures after which the worker is thrown away, and a new one started for the next call. */
const DISCARDED_ON: ReadonlySet<SandboxFailure> = new Set([
  'LOAD_FAILED',
  'TIMEOUT',
  'OUT_OF_MEMORY',
  'CRASHED',
]);

/** A refusal Toppo means the plugin to see, by its code: `FORBIDDEN`, `NOT_FOUND`… */
export class HostCallError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HostCallError';
    this.code = code;
  }
}

export interface PluginSandboxOptions {
  /** The plugin's server bundle: a classic script that defines `__toppo`. */
  code: string;
  memoryMb: number;
  /** The worker's script: `sandbox-worker.ts` from the sources, its own bundle once built. */
  workerUrl: URL;
  /**
   * Does what the plugin asks, once Toppo has checked it may: the arguments parsed, the answer
   * JSON. Throw a `HostCallError` to refuse; any other error is logged and hidden.
   */
  onCall(method: string, args: unknown): Promise<unknown>;
  log: FastifyBaseLogger;
}

export interface PluginRun {
  kind: RunKind;
  name: string;
  payload: unknown;
  context: unknown;
  deadlineMs: number;
}

export interface PluginSandbox {
  /** What the plugin declares, as its bundle answers it. */
  manifest(): Promise<SandboxOutcome<unknown>>;
  run(run: PluginRun): Promise<SandboxOutcome<unknown>>;
  close(): Promise<void>;
}

/**
 * A plugin's sandbox in a worker thread of its own, so that Toppo answers requests while the
 * plugin computes. Runs one call at a time; a worker that goes past its deadline or its memory,
 * or dies, is thrown away and a new one started for the next call.
 */
export function createPluginSandbox(options: PluginSandboxOptions): PluginSandbox {
  let worker: Worker | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let nextId = 0;
  const waiting = new Map<number, (outcome: SandboxOutcome<string>) => void>();

  function start(): Worker {
    const data: WorkerData = { code: options.code, memoryMb: options.memoryMb };
    const started = new Worker(options.workerUrl, {
      workerData: data,
      // Nothing of Toppo's environment: no secret, no database address.
      env: {},
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    started.on('message', (message: FromWorker) => receive(started, message));
    started.on('error', (error) => {
      options.log.error({ err: error }, 'A plugin sandbox failed');
      discard(started, 'CRASHED');
    });
    started.on('exit', () => discard(started, 'CRASHED'));
    return started;
  }

  /** Stops a worker and answers whatever waited on it. */
  function discard(which: Worker, failure: SandboxFailure): void {
    if (worker !== which) {
      return;
    }
    worker = undefined;
    void which.terminate();
    for (const settle of waiting.values()) {
      settle({ ok: false, failure });
    }
    waiting.clear();
  }

  function receive(from: Worker, message: FromWorker): void {
    if (message.type === 'outcome') {
      const settle = waiting.get(message.id);
      waiting.delete(message.id);
      settle?.(message.outcome);
      if (!message.outcome.ok && DISCARDED_ON.has(message.outcome.failure)) {
        discard(from, message.outcome.failure);
      }
      return;
    }
    void answer(from, message.id, message.method, message.args);
  }

  async function answer(to: Worker, id: number, method: string, args: string): Promise<void> {
    const reply = await replyTo(method, args);
    if (worker === to) {
      to.postMessage({ id, type: 'answer', ...reply } satisfies ToWorker);
    }
  }

  async function replyTo(
    method: string,
    args: string,
  ): Promise<{ result: string } | { error: string }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      return { error: 'INVALID_ARGUMENTS' };
    }
    try {
      const result = JSON.stringify((await options.onCall(method, parsed)) ?? null);
      return result.length > MESSAGE_MAX_LENGTH ? { error: 'ANSWER_TOO_LARGE' } : { result };
    } catch (error) {
      if (error instanceof HostCallError) {
        return { error: error.code };
      }
      options.log.error({ err: error, method }, 'A plugin call failed');
      return { error: 'INTERNAL_ERROR' };
    }
  }

  /** Sends one request and waits for its outcome, or stops the worker once past its time. */
  function ask(
    request: (id: number) => ToWorker,
    deadlineMs: number,
  ): Promise<SandboxOutcome<string>> {
    const starting = worker === undefined;
    const target = worker ?? start();
    worker = target;
    const id = nextId++;
    const watchdogMs = deadlineMs + GRACE_MS + (starting ? START_MS + LOAD_DEADLINE_MS : 0);
    return new Promise((resolve) => {
      const timer = setTimeout(() => discard(target, 'TIMEOUT'), watchdogMs);
      waiting.set(id, (outcome) => {
        clearTimeout(timer);
        resolve(outcome);
      });
      target.postMessage(request(id));
    });
  }

  /** One call at a time: the sandbox has one deadline, and a plugin one call in flight. */
  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    manifest: () =>
      serialized(async () =>
        parsed(await ask((id) => ({ type: 'manifest', id }), MANIFEST_DEADLINE_MS)),
      ),
    run: (run) =>
      serialized(async () => {
        const payload = JSON.stringify(run.payload);
        const context = JSON.stringify(run.context);
        if (payload.length > MESSAGE_MAX_LENGTH || context.length > MESSAGE_MAX_LENGTH) {
          throw new RangeError('A plugin run is given at most a megabyte of payload and context');
        }
        const { kind, name, deadlineMs } = run;
        const request = (id: number): ToWorker => ({
          type: 'run',
          id,
          kind,
          name,
          payload,
          context,
          deadlineMs,
        });
        return parsed(await ask(request, deadlineMs));
      }),
    close: () =>
      serialized(async () => {
        const closing = worker;
        if (closing) {
          discard(closing, 'CRASHED');
          await closing.terminate();
        }
      }),
  };
}

/** The plugin's answer, parsed: it must be JSON. */
function parsed(outcome: SandboxOutcome<string>): SandboxOutcome<unknown> {
  if (!outcome.ok) {
    return outcome;
  }
  try {
    return { ok: true, value: JSON.parse(outcome.value) };
  } catch {
    return { ok: false, failure: 'INVALID_ANSWER' };
  }
}
