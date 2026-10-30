import { schema } from '@toppo-tracker/db';
import { webhookDeliveryParamsSchema } from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { queueDelivery } from '../utils/webhook-deliveries.util.ts';
import { lockWebhook } from '../utils/webhook-rows.util.ts';

const { webhookDeliveries } = schema;

/**
 * Sends a delivery again, as it was, under the same `webhook-id`: a receiver that took it already
 * knows it. A new delivery, signed when it is sent.
 */
export const redeliverWebhook = defineCommand({
  name: 'webhook.redeliver',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookDeliveryParamsSchema,
  async handler({ tx, actor, log }, { webhookId, deliveryId }): Promise<{ id: string }> {
    const webhook = await lockWebhook(tx, webhookId);
    const [delivery] = await tx
      .select({
        messageId: webhookDeliveries.messageId,
        eventType: webhookDeliveries.eventType,
        payload: webhookDeliveries.payload,
      })
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.webhookId, webhookId)));
    if (!delivery) {
      throw new HttpError(404, 'WEBHOOK_DELIVERY_NOT_FOUND', 'This delivery is no longer kept');
    }
    if (!webhook.enabled) {
      throw new HttpError(409, 'WEBHOOK_DISABLED', 'Enable the webhook to send it anything');
    }
    const id = await queueDelivery(tx, { webhookId, ...delivery });
    log.info({ webhookId, deliveryId, by: actor.id }, 'Webhook delivery sent again');
    return { id };
  },
});
