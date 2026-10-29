import { schema } from '@toppo-tracker/db';
import type { PeopleResponse } from '@toppo-tracker/shared';
import { and, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { reachableBy } from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { projectMembers, projects, roles, users } = schema;

/**
 * The names of the people asked for that the signed-in person may see: those who share a
 * project with them, by membership or by reaching every project. Someone erased, a plugin's own
 * user and anyone else are left out, never told apart from an id that is no one's.
 */
export const listPeople = defineQuery({
  name: 'user.listPeople',
  access: 'authenticated',
  // As the query string reads once split (`peopleQuerySchema`): a hundred at most.
  input: z.object({ ids: z.array(z.uuid()).max(100) }),
  async handler({ db, actor }, { ids }): Promise<PeopleResponse> {
    if (ids.length === 0) {
      return { people: [] };
    }
    const reachesProject = sql`(
      exists (select 1 from ${roles} where ${roles.id} = ${users.instanceRoleId} and ${roles.grantsAll})
      or ${users.allProjects}
      or exists (select 1 from ${projectMembers}
        where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.userId} = ${users.id})
    )`;
    const people = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          inArray(users.id, ids),
          isNull(users.deletedAt),
          isNull(users.pluginSlug),
          sql`exists (select 1 from ${projects} where ${reachableBy(actor.id)} and ${reachesProject})`,
        ),
      );
    return { people };
  },
});
