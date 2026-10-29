import { schema } from '@toppo-tracker/db';
import { WEBHOOK_DELIVERIES_KEPT } from '@toppo-tracker/shared';
import { and, desc, eq, ne, notInArray } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { enqueue } from '../../../platform/jobs/jobs.ts';
import { deliverWebhookJob } from '../jobs/deliver-webhook.job.ts';

const { webhookDeliveries } = schema;

export interface DeliveryRequest {
  webhookId: string;
  /** `webhook-id`: the event's, or the delivery's sent again. */
  messageId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Queues a delivery to a webhook, sent by a job once the transaction commits, and forgets its
 * finished deliveries past the last 50: those still to send are never forgotten.
 */
export async function queueDelivery(tx: Transaction, request: DeliveryRequest): Promise<string> {
  const [delivery] = await tx
    .insert(webhookDeliveries)
    .values(request)
    .returning({ id: webhookDeliveries.id });
  if (!delivery) {
    throw new Error('The delivery was not queued');
  }
  await enqueue(tx, deliverWebhookJob, { deliveryId: delivery.id });
  const kept = tx
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, request.webhookId))
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(WEBHOOK_DELIVERIES_KEPT);
  await tx
    .delete(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.webhookId, request.webhookId),
        ne(webhookDeliveries.status, 'pending'),
        notInArray(webhookDeliveries.id, kept),
      ),
    );
  return delivery.id;
}
