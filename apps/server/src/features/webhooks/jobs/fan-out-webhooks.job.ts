import { schema } from '@toppo-tracker/db';
import { asc, eq, inArray } from 'drizzle-orm';
import { WEBHOOKS_TOLD } from '../../../platform/activities/record-activity.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import { queueDelivery } from '../utils/webhook-deliveries.util.ts';
import { type WebhookPayload, webhookPayloadOf } from '../utils/webhook-event.util.ts';

const { activities, webhookProjects, webhooks } = schema;

interface Recorded {
  id: string;
  type: string;
  projectId: string;
}

/**
 * Queues a delivery of each activity recorded together to each enabled webhook told of it, in
 * the projects it is told of: one webhook slow or failing is tried again alone, and never delays
 * the others. Each event is read once, whatever the number of webhooks.
 */
export const fanOutWebhooksJob = defineJob({
  type: WEBHOOKS_TOLD.type,
  payload: WEBHOOKS_TOLD.payload,
  async handler({ tx, db, log }, { activityIds }) {
    const recorded = await tx
      .select({ id: activities.id, type: activities.type, projectId: activities.projectId })
      .from(activities)
      .where(inArray(activities.id, activityIds))
      // Ids are UUID v7: in the order they were recorded.
      .orderBy(asc(activities.id));
    const listening = await tx
      .select({ id: webhooks.id, events: webhooks.events, allProjects: webhooks.allProjects })
      .from(webhooks)
      .where(eq(webhooks.enabled, true));
    const payloads = new Map<string, WebhookPayload | null>();
    for (const webhook of listening) {
      for (const activity of await toldOf(tx, webhook, recorded)) {
        if (!payloads.has(activity.id)) {
          payloads.set(activity.id, await webhookPayloadOf(db, activity.id));
        }
        const payload = payloads.get(activity.id);
        if (payload) {
          await queueDelivery(tx, {
            webhookId: webhook.id,
            messageId: activity.id,
            eventType: activity.type,
            payload,
          });
        }
      }
    }
    log.debug({ activities: recorded.length, webhooks: listening.length }, 'Webhooks told');
  },
});

/** The activities among those recorded a webhook is told of: its events, in its projects. */
async function toldOf(
  tx: Transaction,
  webhook: { id: string; events: string[]; allProjects: boolean },
  recorded: readonly Recorded[],
): Promise<Recorded[]> {
  const heard = new Set(webhook.events);
  const projectIds = webhook.allProjects
    ? null
    : new Set(
        (
          await tx
            .select({ projectId: webhookProjects.projectId })
            .from(webhookProjects)
            .where(eq(webhookProjects.webhookId, webhook.id))
        ).map(({ projectId }) => projectId),
      );
  return recorded.filter(
    ({ type, projectId }) => heard.has(type) && (projectIds === null || projectIds.has(projectId)),
  );
}
