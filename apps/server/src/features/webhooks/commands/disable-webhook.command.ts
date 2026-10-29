import { schema } from '@toppo-tracker/db';
import { webhookIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { lockWebhook } from '../utils/webhook-rows.util.ts';

const { webhooks } = schema;

/** Sends nothing more to a webhook until it is enabled again; what is queued is given up. */
export const disableWebhook = defineCommand({
  name: 'webhook.disable',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookIdParamsSchema,
  async handler({ tx, actor, log }, { webhookId }): Promise<void> {
    await lockWebhook(tx, webhookId);
    await tx.update(webhooks).set({ enabled: false }).where(eq(webhooks.id, webhookId));
    log.info({ webhookId, by: actor.id }, 'Webhook disabled');
  },
});
