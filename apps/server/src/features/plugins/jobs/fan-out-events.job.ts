import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { PLUGINS_TOLD } from '../../../platform/activities/record-activity.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { defineJob, enqueue } from '../../../platform/jobs/jobs.ts';
import { deliverEventsJob, EVENTS_PER_DELIVERY } from './deliver-events.job.ts';

const { activities, pluginProjects, plugins, users } = schema;

/**
 * Hands the activities recorded together to each enabled plugin that hears of them, in jobs of
 * its own: one plugin slow or failing is tried again alone, and never delays the others. A plugin
 * hears of the changes in its projects only, and of none a plugin made: plugins answering one
 * another could never stop.
 */
export const fanOutEventsJob = defineJob({
  type: PLUGINS_TOLD.type,
  payload: PLUGINS_TOLD.payload,
  async handler({ tx, log }, { activityIds }) {
    const recorded = await tx
      .select({
        id: activities.id,
        type: activities.type,
        projectId: activities.projectId,
        byPlugin: isNotNull(users.pluginSlug),
      })
      .from(activities)
      .innerJoin(users, eq(users.id, activities.actorId))
      .where(inArray(activities.id, activityIds))
      // Ids are UUID v7: in the order they were recorded.
      .orderBy(asc(activities.id));
    const listening = await tx
      .select({ id: plugins.id, manifest: plugins.manifest, allProjects: plugins.allProjects })
      .from(plugins)
      .where(eq(plugins.state, 'enabled'));
    for (const plugin of listening) {
      const heard = new Set<string>(
        manifestSchema.shape.events.safeParse(plugin.manifest['events']).data,
      );
      const projectIds = plugin.allProjects ? null : await projectsOf(tx, plugin.id);
      const told = recorded.filter(
        ({ type, projectId, byPlugin }) =>
          !byPlugin && heard.has(type) && (projectIds === null || projectIds.has(projectId)),
      );
      for (let start = 0; start < told.length; start += EVENTS_PER_DELIVERY) {
        const batch = told.slice(start, start + EVENTS_PER_DELIVERY).map(({ id }) => id);
        await enqueue(tx, deliverEventsJob, { pluginId: plugin.id, activityIds: batch });
      }
      if (told.length > 0) {
        log.debug({ pluginId: plugin.id, events: told.length }, 'Events handed to a plugin');
      }
    }
  },
});

async function projectsOf(tx: Transaction, pluginId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ projectId: pluginProjects.projectId })
    .from(pluginProjects)
    .where(eq(pluginProjects.pluginId, pluginId));
  return new Set(rows.map(({ projectId }) => projectId));
}
