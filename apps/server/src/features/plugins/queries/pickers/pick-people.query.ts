import { containsText, schema } from '@toppo-tracker/db';
import {
  PICK_LIMIT,
  type PickedPeopleResponse,
  pickQuerySchema,
  pluginSlugParamsSchema,
} from '@toppo-tracker/shared';
import { and, asc, isNull, sql } from 'drizzle-orm';
import { reachableBy, reachedByPerson } from '../../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { pickedIn, pickingPlugin } from '../../utils/pickers/picking-plugin.util.ts';

const { projects, users } = schema;

/**
 * Toppo's search of people for a plugin's screen: those who share with the signed-in person a
 * project where the plugin acts (the one the screen names, if it does), still active, by their
 * name, in its order. Never a plugin's own user, nor anyone erased. A few, never a page.
 */
export const pickPeople = defineQuery({
  name: 'plugin.pickPeople',
  access: 'authenticated',
  input: pluginSlugParamsSchema.extend(pickQuerySchema.shape),
  async handler({ db, actor }, { pluginSlug, search, projectId }): Promise<PickedPeopleResponse> {
    const plugin = await pickingPlugin(db, pluginSlug);
    const people = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          isNull(users.deactivatedAt),
          isNull(users.pluginSlug),
          search === '' ? undefined : containsText([users.name], search),
          sql`exists (select 1 from ${projects} where ${and(
            reachableBy(actor.id),
            reachedByPerson(),
            pickedIn(plugin, projects.id, projectId),
          )})`,
        ),
      )
      .orderBy(asc(users.name), asc(users.id))
      .limit(PICK_LIMIT);
    return { people };
  },
});
