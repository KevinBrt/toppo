import { schema } from '@toppo-tracker/db';
import { webhookIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { webhookInputSchema } from '../models/webhook-input.model.ts';
import { lockWebhook, projectIdsOf } from '../utils/webhook-rows.util.ts';

const { webhookProjects, webhooks } = schema;

/**
 * Changes where a webhook is sent, what of and in which projects. Deliveries already queued go
 * where the webhook points when they are sent; its key stays.
 */
export const updateWebhook = defineCommand({
  name: 'webhook.update',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookInputSchema.and(webhookIdParamsSchema),
  async handler({ tx, actor, log }, { webhookId, ...input }): Promise<void> {
    await lockWebhook(tx, webhookId);
    const projectIds = input.projects === 'all' ? [] : await projectIdsOf(tx, input.projects);
    await tx
      .update(webhooks)
      .set({
        name: input.name,
        url: input.url,
        events: input.events,
        allProjects: input.projects === 'all',
        allowPrivate: input.allowPrivate,
      })
      .where(eq(webhooks.id, webhookId));
    await tx.delete(webhookProjects).where(eq(webhookProjects.webhookId, webhookId));
    if (projectIds.length > 0) {
      await tx
        .insert(webhookProjects)
        .values(projectIds.map((projectId) => ({ webhookId, projectId })));
    }
    log.info({ webhookId, by: actor.id }, 'Webhook changed');
  },
});
