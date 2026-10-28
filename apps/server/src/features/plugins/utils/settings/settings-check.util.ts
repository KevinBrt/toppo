import { runAnswerSchema, type SettingsSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { DEFAULT_LOCALE, type PluginSettingValues } from '@toppo-tracker/shared';
import type { ExecutionContext } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { SETTINGS_CHECK_DEADLINE_MS } from '../../../../platform/plugins/packages/manifest-reader.ts';
import { HostCallError } from '../../../../platform/plugins/sandbox/plugin-sandbox.ts';
import type { SandboxOutcome } from '../../../../platform/plugins/sandbox/sandbox-protocol.ts';

const settingsInvalid = (details: readonly { path: string; message: string }[]) =>
  new HttpError(400, 'PLUGIN_SETTINGS_INVALID', 'The plugin refuses these settings', {
    details: [...details],
  });

/** Refuses settings the plugin does not have, by name. */
export function assertSettingsDeclared(
  declared: SettingsSchema,
  values: PluginSettingValues,
): void {
  const unknown = Object.keys(values).filter((name) => !Object.hasOwn(declared.properties, name));
  if (unknown.length > 0) {
    throw settingsInvalid(
      unknown.map((path) => ({ path, message: 'The plugin has no such setting' })),
    );
  }
}

/**
 * Has the plugin's own schema check settings typed for the instance or a project, in its
 * sandbox, where a hostile one cannot hold Toppo up: refused field by field (400), or in Toppo's
 * words when the plugin fails to answer (502, counted as no failure: someone is there to see it).
 */
export async function checkTypedSettings(
  { services, log }: Pick<ExecutionContext, 'services' | 'log'>,
  plugin: { slug: string; sha256: string },
  scope: 'instance' | 'project',
  values: PluginSettingValues,
): Promise<void> {
  let outcome: SandboxOutcome<unknown>;
  try {
    outcome = await services.plugins.runtime.run(
      plugin,
      {
        kind: 'settings',
        name: scope,
        payload: values,
        context: { locale: DEFAULT_LOCALE, user: null, settings: {} },
        deadlineMs: SETTINGS_CHECK_DEADLINE_MS,
      },
      () => Promise.reject(new HostCallError('FORBIDDEN', 'A plugin checks its settings alone')),
      log,
    );
  } catch (error) {
    log.error({ err: error, plugin: plugin.slug }, 'The plugin could not be run');
    outcome = { ok: false, failure: 'CRASHED' };
  }
  const answer = runAnswerSchema.safeParse(outcome.ok ? outcome.value : null);
  if (answer.success && !answer.data.ok && answer.data.error.code === 'VALIDATION_FAILED') {
    throw settingsInvalid(answer.data.error.issues ?? []);
  }
  if (!(answer.success && answer.data.ok)) {
    log.warn({ plugin: plugin.slug, scope, outcome }, 'Plugin failed to check its settings');
    throw new HttpError(502, 'PLUGIN_FAILED', 'The plugin failed to check its settings');
  }
}
