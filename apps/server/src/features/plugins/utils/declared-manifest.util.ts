import { isReservedPluginId } from '@toppo-tracker/core';
import {
  API_VERSION,
  isApiCompatible,
  type Manifest,
  manifestSchema,
} from '@toppo-tracker/plugin-sdk/protocol';
import type { FastifyBaseLogger } from 'fastify';
import { HttpError } from '../../../platform/http/http-error.ts';
import type {
  SandboxFailure,
  SandboxOutcome,
} from '../../../platform/plugins/sandbox/sandbox-protocol.ts';

/** Why the sandbox got no manifest, as the administrator is told. */
const FAILURES: Readonly<Record<SandboxFailure, string>> = {
  LOAD_FAILED: 'its code fails as it loads',
  TIMEOUT: 'its code took too long to answer',
  OUT_OF_MEMORY: 'its code ran out of memory',
  PLUGIN_ERROR: 'its code threw instead of answering',
  INVALID_ANSWER: 'its code answered something else than a manifest',
  CRASHED: 'its sandbox stopped',
};

/** Issues of a refused manifest shown at most: the rest is the same mistake, repeated. */
const ISSUES_SHOWN = 3;

/**
 * What a bundle declared, as the sandbox answered, once checked as Toppo enforces it: the
 * manifest's format, an API version this Toppo speaks, an id that is not Toppo's own.
 */
export function declaredManifest(
  outcome: SandboxOutcome<unknown>,
  log: FastifyBaseLogger,
): Manifest {
  if (!outcome.ok) {
    // What the plugin wrote stays in the log: the administrator reads it there if need be.
    log.warn({ failure: outcome.failure, detail: outcome.detail }, 'A plugin declared nothing');
    throw new HttpError(
      422,
      'PLUGIN_MANIFEST_UNREADABLE',
      `Toppo could not read what the plugin declares: ${FAILURES[outcome.failure]}`,
    );
  }
  const parsed = manifestSchema.safeParse(outcome.value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, ISSUES_SHOWN)
      .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`);
    throw new HttpError(
      422,
      'PLUGIN_MANIFEST_INVALID',
      `Toppo refuses what the plugin declares: ${issues.join('; ')}`,
    );
  }
  const manifest = parsed.data;
  if (!isApiCompatible(manifest.apiVersion)) {
    throw new HttpError(
      422,
      'PLUGIN_API_INCOMPATIBLE',
      `The plugin needs the plugin API ${manifest.apiVersion}: this Toppo speaks ${API_VERSION}`,
    );
  }
  if (isReservedPluginId(manifest.id)) {
    throw new HttpError(422, 'PLUGIN_ID_RESERVED', `${manifest.id} is a name of Toppo's own`);
  }
  return manifest;
}
