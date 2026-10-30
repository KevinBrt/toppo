import { type Db, schema } from '@toppo-tracker/db';
import { runAnswerSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { enqueue } from '../../../platform/jobs/jobs.ts';
import type { SandboxOutcome } from '../../../platform/plugins/sandbox/sandbox-protocol.ts';
import { emailPluginDisabledJob } from '../jobs/email-plugin-disabled.job.ts';
import {
  FAILURES_BEFORE_DISABLING,
  lastErrorOf,
  type PluginFailure,
} from '../models/plugin-failure.model.ts';

const { plugins, roles, users } = schema;

/** How a run went wrong, if it did, in Toppo's words; what the plugin wrote stays in the log. */
export function failureOf(outcome: SandboxOutcome<unknown>): PluginFailure | null {
  if (!outcome.ok) {
    return outcome.failure;
  }
  const answer = runAnswerSchema.safeParse(outcome.value);
  if (!answer.success) {
    return 'INVALID_ANSWER';
  }
  return answer.data.ok ? null : 'ANSWERED_ERROR';
}

/** A run that went well: the failures counted so far were not in a row. */
export async function recordSuccess(db: Db, pluginId: string): Promise<void> {
  await db
    .update(plugins)
    .set({ failures: 0 })
    .where(and(eq(plugins.id, pluginId), gt(plugins.failures, 0)));
}

/**
 * A run that failed, counted at once, whatever becomes of the job that ran it. Past
 * `FAILURES_BEFORE_DISABLING` in a row, the plugin is disabled, and those who manage plugins are
 * emailed.
 */
export async function recordFailure(
  db: Db,
  plugin: { id: string; slug: string },
  failure: PluginFailure,
  what: string,
  log: FastifyBaseLogger,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [counted] = await tx
      .update(plugins)
      .set({ failures: sql`${plugins.failures} + 1`, lastError: lastErrorOf(failure, what) })
      .where(and(eq(plugins.id, plugin.id), eq(plugins.state, 'enabled')))
      .returning({ failures: plugins.failures });
    if (!counted || counted.failures < FAILURES_BEFORE_DISABLING) {
      return;
    }
    await tx.update(plugins).set({ state: 'disabled' }).where(eq(plugins.id, plugin.id));
    // Those who manage plugins: `instance.plugins.manage` belongs to the system role only.
    const managers = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.instanceRoleId))
      .where(and(eq(roles.grantsAll, true), isNull(users.deactivatedAt)));
    for (const manager of managers) {
      await enqueue(tx, emailPluginDisabledJob, {
        pluginId: plugin.id,
        userId: manager.id,
        failure,
      });
    }
    log.warn(
      { plugin: plugin.slug, failures: counted.failures, failure },
      'Plugin disabled: it failed again and again',
    );
  });
}
