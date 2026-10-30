import { schema } from '@toppo-tracker/db';
import {
  WEBHOOK_DELIVERIES_KEPT,
  type WebhookDetailsResponse,
  webhookIdParamsSchema,
} from '@toppo-tracker/shared';
import { desc, eq } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { summaryColumns, webhookNotFound, webhookSummaries } from '../utils/webhook-rows.util.ts';

const { webhookDeliveries, webhooks } = schema;

/**
 * A webhook and its latest deliveries: what each told, how it went. Never its key, nor what a
 * delivery carried.
 */
export const getWebhook = defineQuery({
  name: 'webhook.get',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookIdParamsSchema,
  async handler({ db }, { webhookId }): Promise<WebhookDetailsResponse> {
    const [row] = await db.select(summaryColumns).from(webhooks).where(eq(webhooks.id, webhookId));
    if (!row) {
      throw webhookNotFound();
    }
    const [summary] = await webhookSummaries(db, [row]);
    if (!summary) {
      throw webhookNotFound();
    }
    const deliveries = await db
      .select({
        id: webhookDeliveries.id,
        messageId: webhookDeliveries.messageId,
        eventType: webhookDeliveries.eventType,
        status: webhookDeliveries.status,
        attempts: webhookDeliveries.attempts,
        responseStatus: webhookDeliveries.responseStatus,
        error: webhookDeliveries.error,
        durationMs: webhookDeliveries.durationMs,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
      .limit(WEBHOOK_DELIVERIES_KEPT);
    return {
      ...summary,
      deliveries: deliveries.map((delivery) => ({
        ...delivery,
        createdAt: delivery.createdAt.toISOString(),
      })),
    };
  },
});
