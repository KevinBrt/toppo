import { schema } from '@toppo-tracker/db';
import { WEBHOOKS_MAX, type WebhooksResponse } from '@toppo-tracker/shared';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { webhookSummaries } from '../utils/webhook-rows.util.ts';

const { webhooks } = schema;

/** Every webhook of the instance, by name: a short list, `WEBHOOKS_MAX` at most. */
export const listWebhooks = defineQuery({
  name: 'webhook.list',
  access: { permission: 'instance.webhooks.manage' },
  input: z.object({}),
  async handler({ db }): Promise<WebhooksResponse> {
    const rows = await db
      .select()
      .from(webhooks)
      .orderBy(asc(webhooks.name), asc(webhooks.id))
      .limit(WEBHOOKS_MAX);
    return { webhooks: await webhookSummaries(db, rows) };
  },
});
