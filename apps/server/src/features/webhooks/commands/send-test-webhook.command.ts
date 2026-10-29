import { uuidv7 } from '@toppo-tracker/db';
import { webhookIdParamsSchema } from '@toppo-tracker/shared';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { queueDelivery } from '../utils/webhook-deliveries.util.ts';
import { lockWebhook } from '../utils/webhook-rows.util.ts';

/**
 * Sends a webhook a test, `webhook.test`, as any delivery is sent and signed: its receiver checks
 * it reads and verifies Toppo's requests before any event is told. Its outcome shows among the
 * webhook's deliveries.
 */
export const sendTestWebhook = defineCommand({
  name: 'webhook.test',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookIdParamsSchema,
  async handler({ tx, actor, log }, { webhookId }): Promise<{ id: string }> {
    const webhook = await lockWebhook(tx, webhookId);
    if (!webhook.enabled) {
      throw new HttpError(409, 'WEBHOOK_DISABLED', 'Enable the webhook to send it anything');
    }
    const messageId = uuidv7();
    const id = await queueDelivery(tx, {
      webhookId,
      messageId,
      eventType: 'webhook.test',
      payload: {
        type: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { webhook: { id: webhookId, name: webhook.name }, sentBy: actor.id },
      },
    });
    log.info({ webhookId, by: actor.id }, 'Webhook test queued');
    return { id };
  },
});
