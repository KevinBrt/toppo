import { schema } from '@toppo-tracker/db';
import { WEBHOOKS_MAX, type WebhookSecretResponse } from '@toppo-tracker/shared';
import { count } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { newWebhookSecret } from '../../../platform/http/signatures/standard-webhooks.ts';
import { webhookInputSchema } from '../models/webhook-input.model.ts';
import { projectIdsOf } from '../utils/webhook-rows.util.ts';

const { webhookProjects, webhooks } = schema;

/**
 * Adds a webhook, told from now on of the events chosen in the projects chosen. Answers its id and
 * the key its requests are signed with: unlike other commands it answers more than an id, since
 * the key, sealed once kept, is shown this once.
 */
export const createWebhook = defineCommand({
  name: 'webhook.create',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookInputSchema,
  async handler({ tx, actor, log, services }, input): Promise<WebhookSecretResponse> {
    const [kept] = await tx.select({ count: count() }).from(webhooks);
    if ((kept?.count ?? 0) >= WEBHOOKS_MAX) {
      throw new HttpError(
        409,
        'WEBHOOK_LIMIT_REACHED',
        `An instance keeps at most ${WEBHOOKS_MAX} webhooks: remove one first`,
      );
    }
    const projectIds = input.projects === 'all' ? [] : await projectIdsOf(tx, input.projects);
    const secret = newWebhookSecret();
    const [webhook] = await tx
      .insert(webhooks)
      .values({
        name: input.name,
        url: input.url,
        secretSealed: services.secrets.seal(secret),
        events: input.events,
        allProjects: input.projects === 'all',
        allowPrivate: input.allowPrivate,
        createdById: actor.id,
      })
      .returning({ id: webhooks.id });
    if (!webhook) {
      throw new Error('The webhook was not created');
    }
    if (projectIds.length > 0) {
      await tx
        .insert(webhookProjects)
        .values(projectIds.map((projectId) => ({ webhookId: webhook.id, projectId })));
    }
    log.info({ webhookId: webhook.id, by: actor.id }, 'Webhook created');
    return { id: webhook.id, secret };
  },
});
