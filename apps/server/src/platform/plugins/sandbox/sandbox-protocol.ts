import type { RunKind } from '@toppo-tracker/plugin-sdk/protocol';

/**
 * What crosses between Toppo and a plugin's sandbox: strings of JSON, each bounded. No object,
 * function or prototype of Toppo's is ever handed to a plugin's code, nor one of its to Toppo.
 * The two globals they meet through are the SDK's protocol: `__toppo` and `__host`.
 */
export { HOST_GLOBAL, PLUGIN_GLOBAL, type RunKind } from '@toppo-tracker/plugin-sdk/protocol';

/** The most characters of one message: a payload, an answer, the arguments of a call. */
export const MESSAGE_MAX_LENGTH = 1_000_000;

export interface RunRequest {
  kind: RunKind;
  /** The action's or the event's name, as the plugin declared it. */
  name: string;
  /** JSON: the input of an action, the payload of an event. */
  payload: string;
  /** JSON: who it runs for, the plugin's settings. */
  context: string;
  deadlineMs: number;
}

/** Why a plugin did not answer, whatever its own code meant to say. */
export type SandboxFailure =
  /** Its bundle threw, or defined no `__toppo`, when it was loaded. */
  | 'LOAD_FAILED'
  /** Past its deadline. */
  | 'TIMEOUT'
  /** Past its memory. */
  | 'OUT_OF_MEMORY'
  /** It threw instead of answering. */
  | 'PLUGIN_ERROR'
  /** It answered something else than a string of JSON within the size allowed. */
  | 'INVALID_ANSWER'
  /** Its worker died. */
  | 'CRASHED';

export interface SandboxFailed {
  ok: false;
  failure: SandboxFailure;
  /** For Toppo's log only: it may hold what the plugin wrote. */
  detail?: string | undefined;
}

export type SandboxOutcome<T> = { ok: true; value: T } | SandboxFailed;

/** Toppo to the worker. */
export type ToWorker =
  | { type: 'manifest'; id: number }
  | ({ type: 'run'; id: number } & RunRequest)
  | { type: 'answer'; id: number; result: string }
  | { type: 'answer'; id: number; error: string };

/** The worker to Toppo. */
export type FromWorker =
  | { type: 'outcome'; id: number; outcome: SandboxOutcome<string> }
  | { type: 'call'; id: number; method: string; args: string };

/** The plugin's code and how much memory it may use, handed to its worker. */
export interface WorkerData {
  code: string;
  memoryMb: number;
}
