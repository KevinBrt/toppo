import { schema } from '@toppo-tracker/db';
import { manifestSchema, runAnswerSchema } from '@toppo-tracker/plugin-sdk/protocol';
import {
  DEFAULT_LOCALE,
  pluginSlugSchema,
  savePluginSettingsRequestSchema,
} from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineDetachedCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { SETTINGS_CHECK_DEADLINE_MS } from '../../../platform/plugins/packages/manifest-reader.ts';
import { HostCallError } from '../../../platform/plugins/sandbox/plugin-sandbox.ts';
import type { SandboxOutcome } from '../../../platform/plugins/sandbox/sandbox-protocol.ts';
import { pluginNotFound } from '../utils/plugin-rows.util.ts';
import { storePluginSettings } from './store-plugin-settings.command.ts';

const { plugins } = schema;

const settingsInvalid = (details: readonly { path: string; message: string }[]) =>
  new HttpError(400, 'PLUGIN_SETTINGS_INVALID', 'The plugin refuses these settings', {
    details: [...details],
  });

/**
 * Saves a plugin's settings once its own schema accepted them, in its sandbox, where a hostile
 * one cannot hold Toppo up: in any state, so that it is set up before it runs. It holds no
 * transaction while the plugin checks them. Settings refused since an upgrade are so corrected.
 */
export const savePluginSettings = defineDetachedCommand({
  name: 'plugin.saveSettings',
  access: { permission: 'instance.plugins.manage' },
  input: savePluginSettingsRequestSchema.extend({ pluginSlug: pluginSlugSchema }),
  async handler({ db, actor, log, services }, { pluginSlug, values }): Promise<void> {
    const [plugin] = await db
      .select({ sha256: plugins.packageSha256, manifest: plugins.manifest })
      .from(plugins)
      .where(eq(plugins.slug, pluginSlug));
    if (!plugin) {
      throw pluginNotFound();
    }
    // Checked as it was installed: a manifest Toppo kept is one it accepted.
    const { settings } = manifestSchema.parse(plugin.manifest);
    const unknown = Object.keys(values).filter((name) => !Object.hasOwn(settings.properties, name));
    if (unknown.length > 0) {
      throw settingsInvalid(
        unknown.map((path) => ({ path, message: 'The plugin has no such setting' })),
      );
    }
    let outcome: SandboxOutcome<unknown>;
    try {
      outcome = await services.plugins.runtime.run(
        { slug: pluginSlug, sha256: plugin.sha256 },
        {
          kind: 'settings',
          name: 'settings',
          payload: values,
          context: { locale: DEFAULT_LOCALE, user: null, settings: {} },
          deadlineMs: SETTINGS_CHECK_DEADLINE_MS,
        },
        () => Promise.reject(new HostCallError('FORBIDDEN', 'A plugin checks its settings alone')),
        log,
      );
    } catch (error) {
      log.error({ err: error, plugin: pluginSlug }, 'The plugin could not be run');
      outcome = { ok: false, failure: 'CRASHED' };
    }
    const answer = runAnswerSchema.safeParse(outcome.ok ? outcome.value : null);
    if (answer.success && !answer.data.ok && answer.data.error.code === 'VALIDATION_FAILED') {
      throw settingsInvalid(answer.data.error.issues ?? []);
    }
    if (!(answer.success && answer.data.ok)) {
      // An administrator waits for the answer, and sees it: no failure is counted against it.
      log.warn({ plugin: pluginSlug, outcome }, 'Plugin failed to check its settings');
      throw new HttpError(502, 'PLUGIN_FAILED', 'The plugin failed to check its settings');
    }
    await storePluginSettings.execute(
      { db, actor, log, services },
      { pluginSlug, sha256: plugin.sha256, values },
    );
  },
});
