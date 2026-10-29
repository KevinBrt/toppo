import { schema } from '@toppo-tracker/db';
import { webhookIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { lockWebhook } from '../utils/webhook-rows.util.ts';

const { webhooks } = schema;

/** Sends to a webhook again from now on, its failures counted from zero. */
export const enableWebhook = defineCommand({
  name: 'webhook.enable',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookIdParamsSchema,
  async handler({ tx, actor, log }, { webhookId }): Promise<void> {
    await lockWebhook(tx, webhookId);
    await tx
      .update(webhooks)
      .set({ enabled: true, failures: 0, lastError: null })
      .where(eq(webhooks.id, webhookId));
    log.info({ webhookId, by: actor.id }, 'Webhook enabled');
  },
});
