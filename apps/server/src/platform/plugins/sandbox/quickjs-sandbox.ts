import releaseSyncModule from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
  type QuickJSRuntime,
} from 'quickjs-emscripten-core';
import {
  HOST_GLOBAL,
  MESSAGE_MAX_LENGTH,
  PLUGIN_GLOBAL,
  type RunRequest,
  type SandboxFailed,
  type SandboxOutcome,
} from './sandbox-protocol.ts';

/**
 * QuickJS built for speed, its WebAssembly in a file of its own. Its types describe CommonJS, whose
 * default export holds it, while Node loads its ESM, whose default export is it: either way.
 */
const RELEASE_SYNC = 'default' in releaseSyncModule ? releaseSyncModule.default : releaseSyncModule;

const MB = 1024 * 1024;
const WASM_PAGE = 64 * 1024;
/** What QuickJS takes to start, out of a plugin's memory. */
export const SANDBOX_MEMORY_MIN_MB = 16;
/**
 * QuickJS must stop a deep recursion before V8 does: past 256 KB, the host's own stack overflows
 * first and the sandbox is lost. 256 KB still allows some 1,300 nested calls.
 */
const STACK_BYTES = 256 * 1024;
/** Loading a bundle defines its functions: nothing that should take long. */
export const LOAD_DEADLINE_MS = 2000;
export const MANIFEST_DEADLINE_MS = 1000;

export interface QuickJsSandboxOptions {
  /** The plugin's server bundle: a classic script that defines `__toppo`. */
  code: string;
  memoryMb: number;
  /** A call of the plugin's to Toppo: its arguments in JSON, Toppo's answer in JSON. */
  call(method: string, args: string): Promise<string>;
}

export interface QuickJsSandbox {
  manifest(): Promise<SandboxOutcome<string>>;
  run(request: RunRequest): Promise<SandboxOutcome<string>>;
  /** False once it went past its memory or its deadline, or broke: it must be thrown away. */
  readonly usable: boolean;
}

interface SandboxState {
  usable: boolean;
  /** Loading the bundle, running a call of Toppo's, or waiting for one. */
  phase: 'loading' | 'running' | 'idle';
  /** When what is under way must stop. */
  deadline: number;
}

/**
 * Loads a plugin's server bundle into QuickJS compiled to WebAssembly: plain JavaScript, with no
 * file, network, process, timer or module of the host, and `__host.call` as its only way out.
 * The module is this sandbox's own, with a memory the engine refuses to grow past: dropping the
 * sandbox frees all of it. Runs one at a time.
 */
export async function createQuickJsSandbox(
  options: QuickJsSandboxOptions,
): Promise<QuickJsSandbox> {
  if (options.memoryMb < SANDBOX_MEMORY_MIN_MB) {
    throw new RangeError(`A plugin needs at least ${SANDBOX_MEMORY_MIN_MB} MB of memory`);
  }
  // QuickJS's own memory limit lets large strings and arrays through: the WebAssembly memory's
  // maximum holds whatever the plugin allocates.
  const memory = new WebAssembly.Memory({
    initial: (SANDBOX_MEMORY_MIN_MB * MB) / WASM_PAGE,
    maximum: (options.memoryMb * MB) / WASM_PAGE,
  });
  const module = await newQuickJSWASMModuleFromVariant(
    newVariant(RELEASE_SYNC, { wasmMemory: memory }),
  );
  const runtime = module.newRuntime();
  runtime.setMaxStackSize(STACK_BYTES);
  const state: SandboxState = { usable: true, phase: 'idle', deadline: Number.POSITIVE_INFINITY };
  // Checked by QuickJS as it runs, built-ins included (a regular expression, a sort).
  runtime.setInterruptHandler(() => state.phase !== 'idle' && Date.now() > state.deadline);
  const context = runtime.newContext();
  defineHost(context, runtime, state, options.call);
  const loaded = load(context, runtime, state, options.code);

  async function invoke(
    name: 'manifest' | 'run',
    args: readonly string[],
    deadlineMs: number,
  ): Promise<SandboxOutcome<string>> {
    if (!loaded.ok) {
      return loaded;
    }
    if (!state.usable) {
      return { ok: false, failure: 'CRASHED', detail: 'The sandbox was thrown away' };
    }
    if (state.phase !== 'idle') {
      throw new Error('A sandbox runs one call at a time');
    }
    state.phase = 'running';
    state.deadline = Date.now() + deadlineMs;
    try {
      return await call(context, runtime, state, name, args);
    } finally {
      state.phase = 'idle';
    }
  }

  return {
    manifest: () => invoke('manifest', [], MANIFEST_DEADLINE_MS),
    run: ({ kind, name, payload, context: runContext, deadlineMs }) =>
      invoke('run', [kind, name, payload, runContext], deadlineMs),
    get usable() {
      return state.usable;
    },
  };
}

/**
 * Runs the bundle, which must define `__toppo` with `manifest()` and `run()`. All of it within the
 * deadline: even reading `__toppo` runs the plugin's code, should it define getters.
 */
function load(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: SandboxState,
  code: string,
): SandboxOutcome<null> {
  state.phase = 'loading';
  state.deadline = Date.now() + LOAD_DEADLINE_MS;
  try {
    const problem = evaluate(context, runtime, state, code);
    if (problem !== null) {
      state.usable = false;
      return { ok: false, failure: 'LOAD_FAILED', detail: problem };
    }
    return { ok: true, value: null };
  } finally {
    state.phase = 'idle';
  }
}

/** What went wrong loading the bundle, or `null`. */
function evaluate(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: SandboxState,
  code: string,
): string | null {
  try {
    for (const script of [code, DEFINES_TOPPO]) {
      const result = context.evalCode(script, 'plugin.js');
      if (result.error) {
        const failed = failureOf(context, state, result.error);
        return failed.detail ?? failed.failure;
      }
      const defines = script !== DEFINES_TOPPO || context.typeof(result.value) === 'string';
      result.value.dispose();
      if (!defines) {
        return `The bundle defines no ${PLUGIN_GLOBAL}`;
      }
    }
    // What the bundle started (a promise, a call refused) settles now, within the deadline.
    drain(runtime);
    return null;
  } catch (error) {
    return String(error);
  }
}

/** A string when `__toppo` has what Toppo calls, `undefined` otherwise. */
const DEFINES_TOPPO = `typeof ${PLUGIN_GLOBAL} === 'object' && ${PLUGIN_GLOBAL} !== null && typeof ${PLUGIN_GLOBAL}.manifest === 'function' && typeof ${PLUGIN_GLOBAL}.run === 'function' ? 'yes' : undefined`;

/** Calls `__toppo[name](...args)` and waits for its answer, a string, until the deadline. */
async function call(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: SandboxState,
  name: string,
  args: readonly string[],
): Promise<SandboxOutcome<string>> {
  const handles = args.map((arg) => context.newString(arg));
  let answered: QuickJSHandle;
  try {
    // Read again at each call, within its deadline: the plugin may have changed it, getters and all.
    const target = context.getProp(context.global, PLUGIN_GLOBAL);
    handles.push(target);
    const fn = context.getProp(target, name);
    handles.push(fn);
    const result = context.callFunction(fn, target, ...handles.slice(0, args.length));
    if (result.error) {
      return failureOf(context, state, result.error);
    }
    answered = result.value;
  } catch (error) {
    // The WebAssembly module itself gave up.
    state.usable = false;
    return { ok: false, failure: 'CRASHED', detail: String(error) };
  } finally {
    for (const handle of handles) {
      handle.dispose();
    }
  }
  // Listen first, then run the jobs pending: an answer that needs no call to Toppo settles there.
  const settling = context.resolvePromise(answered);
  answered.dispose();
  drain(runtime);
  const settled = await beforeDeadline(settling, state.deadline);
  if (settled === 'late') {
    // Its code may still go on when a call it waits for answers: never let that run in another
    // call's time.
    state.usable = false;
    void settling.then((late) => late.dispose());
    return { ok: false, failure: 'TIMEOUT' };
  }
  if (settled.error) {
    return failureOf(context, state, settled.error);
  }
  const answer = settled.value;
  const text = context.typeof(answer) === 'string' ? context.getString(answer) : null;
  answer.dispose();
  if (text === null || text.length > MESSAGE_MAX_LENGTH) {
    return { ok: false, failure: 'INVALID_ANSWER' };
  }
  return { ok: true, value: text };
}

/** Defines `__host.call(method, args)`, which answers a promise of Toppo's answer. */
function defineHost(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: SandboxState,
  callToppo: QuickJsSandboxOptions['call'],
): void {
  const host = context.newObject();
  const call = context.newFunction('call', (methodHandle, argsHandle) => {
    const deferred = context.newPromise();
    const method = stringOf(context, methodHandle);
    const args = stringOf(context, argsHandle);
    if (state.phase !== 'running') {
      settle(context, runtime, state, deferred, { error: 'Toppo is not running this plugin' });
    } else if (method === null || args === null || args.length > MESSAGE_MAX_LENGTH) {
      settle(context, runtime, state, deferred, {
        error: 'A call takes a method and its arguments in JSON, within the size allowed',
      });
    } else {
      callToppo(method, args).then(
        (answer) =>
          settle(
            context,
            runtime,
            state,
            deferred,
            answer.length > MESSAGE_MAX_LENGTH ? { error: 'Answer too large' } : { value: answer },
          ),
        (error: unknown) =>
          settle(context, runtime, state, deferred, {
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    }
    return deferred.handle;
  });
  context.setProp(host, 'call', call);
  context.setProp(context.global, HOST_GLOBAL, host);
  call.dispose();
  host.dispose();
}

/** Settles a promise the plugin holds, then runs what waited on it. */
function settle(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: SandboxState,
  deferred: QuickJSDeferredPromise,
  answer: { value: string } | { error: string },
): void {
  // An answer after the deadline would run the plugin's code outside any call, and its time.
  if (!state.usable) {
    return;
  }
  const handle =
    'value' in answer ? context.newString(answer.value) : context.newError(answer.error);
  if ('value' in answer) {
    deferred.resolve(handle);
  } else {
    deferred.reject(handle);
  }
  handle.dispose();
  drain(runtime);
}

function drain(runtime: QuickJSRuntime): void {
  runtime.executePendingJobs().dispose();
}

function stringOf(context: QuickJSContext, handle: QuickJSHandle | undefined): string | null {
  return handle && context.typeof(handle) === 'string' ? context.getString(handle) : null;
}

/** The most characters of what a plugin threw kept for the log. */
const DETAIL_MAX_LENGTH = 500;

/**
 * What a thrown value says: past the deadline, past the memory, or the plugin's own error. Only
 * its `name` and `message` are read, never converted: that would run the plugin's code.
 */
function failureOf(
  context: QuickJSContext,
  state: SandboxState,
  errorHandle: QuickJSHandle,
): SandboxFailed {
  const name = ownString(context, errorHandle, 'name');
  const message = ownString(context, errorHandle, 'message');
  errorHandle.dispose();
  if (name === 'InternalError' && message === 'interrupted') {
    state.usable = false;
    return { ok: false, failure: 'TIMEOUT' };
  }
  if (name === 'InternalError' && message === 'out of memory') {
    state.usable = false;
    return { ok: false, failure: 'OUT_OF_MEMORY' };
  }
  return {
    ok: false,
    failure: 'PLUGIN_ERROR',
    detail: message?.slice(0, DETAIL_MAX_LENGTH) ?? 'It threw something else than an Error',
  };
}

/** A property of an object that holds a string, or `undefined` whatever else it holds or does. */
function ownString(
  context: QuickJSContext,
  handle: QuickJSHandle,
  key: string,
): string | undefined {
  if (context.typeof(handle) !== 'object') {
    return undefined;
  }
  try {
    const property = context.getProp(handle, key);
    const value = context.typeof(property) === 'string' ? context.getString(property) : undefined;
    property.dispose();
    return value;
  } catch {
    // A getter that threw or was stopped: then it says nothing.
    return undefined;
  }
}

/** Its value once settled, or `'late'` once the deadline is past. */
function beforeDeadline<T>(settling: Promise<T>, deadline: number): Promise<T | 'late'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('late'), Math.max(0, deadline - Date.now()));
    void settling.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
