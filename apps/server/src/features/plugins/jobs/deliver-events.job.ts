import { DEFAULT_LOCALE } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import { answerCalls } from '../../../platform/plugins/host-calls.ts';
import type { SandboxOutcome } from '../../../platform/plugins/sandbox/sandbox-protocol.ts';
import { actingPlugin } from '../utils/plugin-actor.util.ts';
import { pluginEventOf } from '../utils/plugin-event.util.ts';
import { failureOf, recordFailure, recordSuccess } from '../utils/plugin-failures.util.ts';

/**
 * Events a job hands a plugin at most: each may take a minute, and a job holds its lease for a
 * quarter of an hour.
 */
export const EVENTS_PER_DELIVERY = 10;

/** What a plugin's handler of an event may take: nobody waits for it. */
const EVENT_DEADLINE_MS = 60_000;

/**
 * Hands a plugin the events it hears of, one after the other, as itself: its own user, its needs,
 * its projects. One that fails fails the job, tried again later with the ones before it, which
 * `{ once: event.id }` keeps from writing twice. What the plugin writes commits as it goes; its
 * failures are counted at once.
 */
export const deliverEventsJob = defineJob({
  type: 'plugin.events',
  payload: z.object({
    pluginId: z.uuid(),
    activityIds: z.array(z.uuid()).min(1).max(EVENTS_PER_DELIVERY),
  }),
  async handler({ db, log, services }, { pluginId, activityIds }) {
    const plugin = await actingPlugin(db, { id: pluginId }, services.secrets);
    if (!plugin) {
      log.info({ pluginId }, 'Events no longer to hand: the plugin is not enabled');
      return;
    }
    const context = { db, actor: plugin.actor, log, services };
    const onCall = answerCalls(services.plugins.calls, context, plugin.needs);
    for (const activityId of activityIds) {
      const event = await pluginEventOf(context, services.plugins.calls, activityId);
      if (!event) {
        continue;
      }
      let outcome: SandboxOutcome<unknown>;
      try {
        outcome = await services.plugins.runtime.run(
          { slug: plugin.slug, sha256: plugin.sha256 },
          {
            kind: 'event',
            name: event.type,
            payload: event.payload,
            context: { locale: DEFAULT_LOCALE, user: null, settings: plugin.settings },
            deadlineMs: EVENT_DEADLINE_MS,
          },
          onCall,
          log,
        );
      } catch (error) {
        log.error({ err: error, plugin: plugin.slug }, 'The plugin could not be run');
        outcome = { ok: false, failure: 'CRASHED' };
      }
      const failure = failureOf(outcome);
      if (failure) {
        log.warn({ plugin: plugin.slug, event: event.type, failure, outcome }, 'Plugin failed');
        await recordFailure(db, plugin, failure, event.type, log);
        throw new Error(`${plugin.slug} failed to handle ${event.type}: ${failure}`);
      }
    }
    await recordSuccess(db, plugin.id);
  },
});
