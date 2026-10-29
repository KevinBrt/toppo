import { JOB_EVERY_MS, JOB_NAME } from '@toppo-tracker/plugin-sdk/protocol';
import { DEFAULT_LOCALE } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineJob, type JobOutcome } from '../../../platform/jobs/jobs.ts';
import { answerCalls } from '../../../platform/plugins/host-calls.ts';
import type { SandboxOutcome } from '../../../platform/plugins/sandbox/sandbox-protocol.ts';
import { actingPlugin } from '../utils/plugin-actor.util.ts';
import { failureOf, recordFailure, recordSuccess } from '../utils/plugin-failures.util.ts';

/** What a plugin's job may take: nobody waits for it. */
const JOB_DEADLINE_MS = 60_000;

/**
 * Runs one of a plugin's jobs, as itself, then again when its time comes: every hour, day or
 * week from this run. A job the plugin no longer has, or a plugin no longer enabled, runs no
 * more; one that fails is tried again later, its failures counted at once, and queued anew by
 * `plugin.jobs.schedule` once given up.
 */
export const runPluginJobJob = defineJob({
  type: 'plugin.job',
  payload: z.object({ pluginId: z.uuid(), job: z.string().regex(JOB_NAME) }),
  async handler({ db, log, services }, { pluginId, job }): Promise<JobOutcome | undefined> {
    const plugin = await actingPlugin(db, { id: pluginId }, services.secrets);
    const declared = plugin?.manifest.jobs.find(({ name }) => name === job);
    if (!(plugin && declared)) {
      log.info({ pluginId, job }, 'Job no longer to run: its plugin is not enabled, or lacks it');
      return undefined;
    }
    const context = { db, actor: plugin.actor, log, services };
    let outcome: SandboxOutcome<unknown>;
    try {
      outcome = await services.plugins.runtime.run(
        { slug: plugin.slug, sha256: plugin.sha256 },
        {
          kind: 'job',
          name: job,
          payload: null,
          context: { locale: DEFAULT_LOCALE, user: null, settings: plugin.settings },
          deadlineMs: JOB_DEADLINE_MS,
        },
        answerCalls(services.plugins.calls, context, plugin.needs),
        log,
      );
    } catch (error) {
      log.error({ err: error, plugin: plugin.slug }, 'The plugin could not be run');
      outcome = { ok: false, failure: 'CRASHED' };
    }
    const failure = failureOf(outcome);
    if (failure) {
      log.warn({ plugin: plugin.slug, job, failure, outcome }, 'Plugin failed');
      await recordFailure(db, plugin, failure, `job ${job}`, log);
      throw new Error(`${plugin.slug} failed its job ${job}: ${failure}`);
    }
    await recordSuccess(db, plugin.id);
    return { runAgainInMs: JOB_EVERY_MS[declared.every] };
  },
});
