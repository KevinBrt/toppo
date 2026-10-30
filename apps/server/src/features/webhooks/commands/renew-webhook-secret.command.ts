import { schema } from '@toppo-tracker/db';
import { type WebhookSecretResponse, webhookIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { newWebhookSecret } from '../../../platform/http/signatures/standard-webhooks.ts';
import { lockWebhook } from '../utils/webhook-rows.util.ts';

const { webhooks } = schema;

/**
 * Gives a webhook a new key, the old one no longer signing anything: its receiver must take the
 * new one, shown this once (a lost key, or one the instance can no longer read, is replaced so).
 */
export const renewWebhookSecret = defineCommand({
  name: 'webhook.renewSecret',
  access: { permission: 'instance.webhooks.manage' },
  input: webhookIdParamsSchema,
  async handler({ tx, actor, log, services }, { webhookId }): Promise<WebhookSecretResponse> {
    await lockWebhook(tx, webhookId);
    const secret = newWebhookSecret();
    await tx
      .update(webhooks)
      .set({ secretSealed: services.secrets.seal(secret) })
      .where(eq(webhooks.id, webhookId));
    log.info({ webhookId, by: actor.id }, 'Webhook key renewed');
    return { id: webhookId, secret };
  },
});
