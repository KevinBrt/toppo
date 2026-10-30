import { type Db, schema } from '@toppo-tracker/db';
import { signedHeaders } from '@toppo-tracker/plugin-sdk/host';
import { WEBHOOK_FAILURES_BEFORE_DISABLING } from '@toppo-tracker/shared';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  OUTBOUND_LIMITS,
  OutboundError,
  outboundFetch,
} from '../../../platform/http/outbound/outbound-fetch.ts';
import { nodeCrypto } from '../../../platform/http/signatures/node-crypto.ts';
import { defineJob, enqueue } from '../../../platform/jobs/jobs.ts';
import { emailWebhookDisabledJob } from './email-webhook-disabled.job.ts';

const { roles, users, webhookDeliveries, webhooks } = schema;

/** Tries of a delivery, the last some forty minutes after the first: then it is given up. */
const ATTEMPTS = 5;

/** Its answer is read to its end, and never followed elsewhere: a redirect is a failure. */
const LIMITS = { ...OUTBOUND_LIMITS, maxRedirects: 0 };

/**
 * Sends a delivery to its webhook: a `POST` of its JSON, signed with the webhook's key, through
 * the guard of what leaves Toppo (public addresses only, unless the administrators allowed one
 * inside the network). A 2xx answer delivers it; anything else is tried again, with a longer wait
 * each time, then given up, which counts once against the webhook. What it records commits
 * whatever becomes of the job.
 */
export const deliverWebhookJob = defineJob({
  type: 'webhook.deliver',
  payload: z.object({ deliveryId: z.uuid() }),
  maxAttempts: ATTEMPTS,
  waitsOutside: true,
  async handler({ db, attempt, log, services }, { deliveryId }) {
    const [found] = await db
      .select({ delivery: webhookDeliveries, webhook: webhooks })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(eq(webhookDeliveries.id, deliveryId));
    if (!found) {
      log.info({ deliveryId }, 'Delivery no longer to send: its webhook is gone');
      return;
    }
    const { delivery, webhook } = found;
    const settle = (changes: Partial<typeof webhookDeliveries.$inferInsert>) =>
      db
        .update(webhookDeliveries)
        .set({ attempts: attempt, ...changes })
        .where(eq(webhookDeliveries.id, deliveryId));
    if (!webhook.enabled) {
      await settle({ status: 'failed', error: 'WEBHOOK_DISABLED' });
      return;
    }
    const secret = services.secrets.open(webhook.secretSealed);
    if (secret === null) {
      await settle({ status: 'failed', error: 'SECRET_UNREADABLE' });
      await givenUp(db, log, webhook, 'SECRET_UNREADABLE');
      return;
    }
    const body = JSON.stringify(delivery.payload);
    const started = performance.now();
    let outcome: { responseStatus: number } | { error: OutboundError['code'] };
    try {
      const answer = await outboundFetch(
        {
          url: webhook.url,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...signedHeaders(nodeCrypto, { scheme: 'standard-webhooks', secret }, body, {
              id: delivery.messageId,
              timestamp: Math.floor(Date.now() / 1000),
            }),
          },
          body,
        },
        {
          caller: `webhook:${webhook.id}`,
          mayReach: () => true,
          mayReachInside: () => webhook.allowPrivate,
          // Issues' words in clear, to a receiver inside the network only.
          clearInsideOnly: true,
        },
        LIMITS,
      );
      outcome = { responseStatus: answer.status };
    } catch (error) {
      if (!(error instanceof OutboundError)) {
        throw error;
      }
      outcome = { error: error.code };
    }
    const durationMs = Math.round(performance.now() - started);
    if (
      'responseStatus' in outcome &&
      outcome.responseStatus >= 200 &&
      outcome.responseStatus < 300
    ) {
      await settle({
        status: 'delivered',
        responseStatus: outcome.responseStatus,
        error: null,
        durationMs,
      });
      await db
        .update(webhooks)
        .set({ failures: 0 })
        .where(and(eq(webhooks.id, webhook.id), gt(webhooks.failures, 0)));
      return;
    }
    const lastError =
      'responseStatus' in outcome ? `HTTP_${outcome.responseStatus}` : outcome.error;
    const final = attempt >= ATTEMPTS;
    await settle({
      status: final ? 'failed' : 'pending',
      responseStatus: 'responseStatus' in outcome ? outcome.responseStatus : null,
      error: 'error' in outcome ? outcome.error : null,
      durationMs,
    });
    if (final) {
      await givenUp(db, log, webhook, lastError);
      return;
    }
    throw new Error(`The webhook ${webhook.id} was not delivered: ${lastError}`);
  },
});

/**
 * A delivery given up counts against its webhook: past a few in a row, it is disabled, and those
 * who manage webhooks are emailed.
 */
async function givenUp(
  db: Db,
  log: FastifyBaseLogger,
  webhook: { id: string; name: string },
  lastError: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [counted] = await tx
      .update(webhooks)
      .set({ failures: sql`${webhooks.failures} + 1`, lastError })
      .where(and(eq(webhooks.id, webhook.id), eq(webhooks.enabled, true)))
      .returning({ failures: webhooks.failures });
    if (!counted || counted.failures < WEBHOOK_FAILURES_BEFORE_DISABLING) {
      return;
    }
    await tx.update(webhooks).set({ enabled: false }).where(eq(webhooks.id, webhook.id));
    // Those who manage webhooks: `instance.webhooks.manage` belongs to the system role only.
    const managers = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.instanceRoleId))
      .where(and(eq(roles.grantsAll, true), isNull(users.deactivatedAt)));
    for (const manager of managers) {
      await enqueue(tx, emailWebhookDisabledJob, { webhookId: webhook.id, userId: manager.id });
    }
    log.warn({ webhookId: webhook.id, lastError }, 'Webhook disabled: its deliveries kept failing');
  });
}
