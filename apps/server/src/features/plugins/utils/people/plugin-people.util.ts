import { type Db, schema } from '@toppo-tracker/db';
import { and, eq, inArray, isNull, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { PluginReach } from '../../../../platform/auth/actor.ts';
import { reachableBy } from '../../../../platform/auth/project-access.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { projects, users } = schema;

/**
 * Whether the person `personId` (an id, or a column of each row) reaches a project the plugin
 * acts in, and `also` holds of that project: among the plugin's people.
 */
export function amongPeopleOf(plugin: PluginReach, personId: string | SQLWrapper, also?: SQL): SQL {
  const actsIn = plugin.allProjects ? undefined : inArray(projects.id, [...plugin.projectIds]);
  return sql`exists (select 1 from ${projects} where ${and(actsIn, reachableBy(personId), also)})`;
}

/**
 * Someone the plugin writes about or asks about: acting for someone, themselves only; as itself,
 * any of its people, never a plugin's user nor anyone erased.
 */
export async function pluginPersonOf(
  db: Pick<Db, 'select'>,
  plugin: PluginReach,
  personId: string,
): Promise<string> {
  const actingFor = plugin.onBehalfOf;
  if (actingFor && actingFor.id !== personId) {
    throw new HttpError(403, 'FORBIDDEN', 'Acting for someone, a plugin is about that person only');
  }
  const [person] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, personId),
        isNull(users.pluginSlug),
        isNull(users.deletedAt),
        amongPeopleOf(plugin, personId),
      ),
    );
  if (!person) {
    throw new HttpError(404, 'PERSON_NOT_FOUND', 'This person does not exist');
  }
  return person.id;
}
