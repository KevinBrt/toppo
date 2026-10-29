import { schema } from '@toppo-tracker/db';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import { webhookDisabledMail } from '../utils/webhook-disabled-mail.util.ts';

const { users, webhooks } = schema;

/**
 * Emails someone who manages webhooks that one was disabled for its deliveries failing again and
 * again. Not sent once it is enabled again, or to an account deactivated meanwhile.
 */
export const emailWebhookDisabledJob = defineJob({
  type: 'webhook.disabledEmail',
  payload: z.object({ webhookId: z.uuid(), userId: z.uuid() }),
  async handler({ tx, services, log }, { webhookId, userId }) {
    const [webhook] = await tx
      .select({ name: webhooks.name, lastError: webhooks.lastError })
      .from(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.enabled, false)));
    const [manager] = await tx
      .select({ name: users.name, email: users.email, locale: users.locale })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deactivatedAt)));
    if (!(webhook && manager && (await services.mailer.isConfigured(tx)))) {
      log.info({ webhookId, userId }, 'Webhook disabled: no longer to email');
      return;
    }
    await services.mailer.send(tx, {
      to: { name: manager.name, address: manager.email },
      ...webhookDisabledMail(manager.locale, {
        webhook: webhook.name,
        lastError: webhook.lastError ?? 'NETWORK_ERROR',
        link: new URL(`/settings/webhooks/${webhookId}`, services.publicUrl),
      }),
    });
    log.info({ webhookId, userId }, 'Webhook disabled: emailed');
  },
});
