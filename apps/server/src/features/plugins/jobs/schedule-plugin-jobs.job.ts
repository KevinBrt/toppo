import { schema } from '@toppo-tracker/db';
import { JOB_EVERY_MS, manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob, enqueue } from '../../../platform/jobs/jobs.ts';
import { runPluginJobJob } from './run-plugin-job.job.ts';

const { plugins } = schema;

const EVERY_HOUR_MS = 60 * 60 * 1000;

/**
 * Queues the jobs of the plugins enabled that are not queued yet: those of a plugin approved or
 * enabled since, and those given up after failing. Each runs first once its time has passed, then
 * at its own pace. One queued under its key, whatever the number of servers.
 */
export const schedulePluginJobsJob = defineJob({
  type: 'plugin.jobs.schedule',
  payload: z.object({}),
  every: EVERY_HOUR_MS,
  async handler({ tx }) {
    const enabled = await tx
      .select({ id: plugins.id, manifest: plugins.manifest })
      .from(plugins)
      .where(eq(plugins.state, 'enabled'));
    for (const plugin of enabled) {
      // Checked as it was installed: a manifest Toppo kept is one it accepted.
      for (const { name, every } of manifestSchema.parse(plugin.manifest).jobs) {
        await enqueue(
          tx,
          runPluginJobJob,
          { pluginId: plugin.id, job: name },
          {
            uniqueKey: `plugin.job:${plugin.id}:${name}`,
            runAt: new Date(Date.now() + JOB_EVERY_MS[every]),
          },
        );
      }
    }
  },
});
