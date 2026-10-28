import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import { pluginNameOf } from '../../../platform/plugins/plugin-words.ts';
import { pluginFailureSchema } from '../models/plugin-failure.model.ts';
import { pluginDisabledMail } from '../utils/plugin-disabled-mail.util.ts';

const { plugins, users } = schema;

/**
 * Emails someone who manages plugins that one was disabled for failing again and again. Not sent
 * once it is enabled again, or to an account deactivated meanwhile.
 */
export const emailPluginDisabledJob = defineJob({
  type: 'plugin.disabledEmail',
  payload: z.object({ pluginId: z.uuid(), userId: z.uuid(), failure: pluginFailureSchema }),
  async handler({ tx, services, log }, { pluginId, userId, failure }) {
    const [plugin] = await tx
      .select({ manifest: plugins.manifest })
      .from(plugins)
      .where(and(eq(plugins.id, pluginId), eq(plugins.state, 'disabled')));
    const [manager] = await tx
      .select({ name: users.name, email: users.email, locale: users.locale })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deactivatedAt)));
    if (!(plugin && manager && (await services.mailer.isConfigured(tx)))) {
      log.info({ pluginId, userId }, 'Plugin disabled: no longer to email');
      return;
    }
    await services.mailer.send(tx, {
      to: { name: manager.name, address: manager.email },
      ...pluginDisabledMail(manager.locale, {
        plugin: pluginNameOf(manifestSchema.parse(plugin.manifest))[manager.locale],
        failure,
        link: new URL('/settings/plugins', services.publicUrl),
      }),
    });
    log.info({ pluginId, userId }, 'Plugin disabled: emailed');
  },
});
