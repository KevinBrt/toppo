import { schema } from '@toppo-tracker/db';
import { webhookIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { lockWebhook } from '../utils/webhook-rows.util.ts';

const { webhooks } = schema;

/** Removes a webhook and its deliveries: those still queued are never sent. */
export const deleteWebhook = defineCommand({
  name: 'webhook.delete',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookIdParamsSchema,
  async handler({ tx, actor, log }, { webhookId }): Promise<void> {
    await lockWebhook(tx, webhookId);
    await tx.delete(webhooks).where(eq(webhooks.id, webhookId));
    log.info({ webhookId, by: actor.id }, 'Webhook deleted');
  },
});
